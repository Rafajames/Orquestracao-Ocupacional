-- Orquestração Ocupacional — migração 002: segurança (RLS, triggers, funções do portal por link)
-- Princípios (doc 03 §5–§8): mínimo privilégio; anônimo sem acesso direto a tabelas;
-- organization_id/patient_id/created_by nunca confiados ao cliente; token guardado só como hash.

-- ───────────────────────── Helpers (SECURITY DEFINER para evitar recursão de RLS) ─────────────────────────
create function org_role(org uuid) returns text language sql stable security definer set search_path = public as $$
  select m.role from organization_members m where m.organization_id = org and m.professional_id = auth.uid()
$$;
create function is_org_member(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select org_role(org) is not null
$$;
create function can_write_org(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(org_role(org) in ('owner','admin','professional'), false)
$$;
create function is_org_admin(org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(org_role(org) in ('owner','admin'), false)
$$;
create function assessment_org(aid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from assessments where id = aid
$$;
create function patient_org(pid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from patients where id = pid
$$;
create function template_org(tid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from assessment_templates where id = tid
$$;
create function record_org(rid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select a.organization_id from activity_records r join assessments a on a.id = r.assessment_id where r.id = rid
$$;
create function shares_org_with(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m1 join organization_members m2 on m1.organization_id = m2.organization_id
    where m1.professional_id = auth.uid() and m2.professional_id = pid)
$$;

-- ───────────────────────── Triggers de integridade ─────────────────────────
-- created_by/author_id vêm do JWT, nunca do cliente.
create function force_actor() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid()));
  end if;
  return new;
end $$;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Colunas de vínculo são imutáveis (rejeita troca de organization_id / patient_id etc.).
create function lock_columns() returns trigger language plpgsql as $$
declare col text;
begin
  foreach col in array tg_argv loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception 'campo imutável: %', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create function assessments_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if patient_org(new.patient_id) is distinct from new.organization_id then
      raise exception 'paciente não pertence à organização' using errcode = '42501';
    end if;
    if new.template_id is not null and template_org(new.template_id) is distinct from new.organization_id then
      raise exception 'modelo não pertence à organização' using errcode = '42501';
    end if;
  else
    if old.status = 'cancelled' and new.status <> 'cancelled' then
      raise exception 'avaliação cancelada não pode ser reaberta';
    end if;
    -- Histórico preservado: após sair do rascunho, período/snapshots/formatos não mudam.
    if old.status <> 'draft' and (
         new.catalog_snapshot is distinct from old.catalog_snapshot
      or new.field_snapshot   is distinct from old.field_snapshot
      or new.start_date       is distinct from old.start_date
      or new.end_date         is distinct from old.end_date
      or new.fill_formats     is distinct from old.fill_formats
      or new.target_type      is distinct from old.target_type) then
      raise exception 'avaliação enviada é imutável (período, catálogo e campos)';
    end if;
  end if;
  return new;
end $$;

create function records_guard() returns trigger language plpgsql as $$
declare a assessments; sess_assessment uuid; snap jsonb;
begin
  select assessment_id into sess_assessment from response_sessions where id = new.response_session_id;
  if sess_assessment is distinct from new.assessment_id then
    raise exception 'sessão não pertence à avaliação' using errcode = '42501';
  end if;
  select * into a from assessments where id = new.assessment_id;
  -- O snapshot da atividade vem SEMPRE da avaliação (não do cliente) e a atividade precisa estar nela.
  select e into snap from jsonb_array_elements(a.catalog_snapshot) e where e->>'occupationId' = new.occupation_id::text limit 1;
  if snap is null then
    raise exception 'atividade não faz parte desta avaliação';
  end if;
  new.occupation_snapshot := snap;
  return new;
end $$;

create function discomfort_guard() returns trigger language plpgsql as $$
declare fs jsonb;
begin
  select a.field_snapshot into fs from activity_records r join assessments a on a.id = r.assessment_id where r.id = new.activity_record_id;
  if new.discomfort_type = 'none' and exists (select 1 from discomfort_selections where activity_record_id = new.activity_record_id) then
    raise exception '“Sem desconforto” não pode coexistir com outro tipo';
  end if;
  if new.discomfort_type <> 'none' and exists (select 1 from discomfort_selections where activity_record_id = new.activity_record_id and discomfort_type = 'none') then
    raise exception '“Sem desconforto” não pode coexistir com outro tipo';
  end if;
  if new.discomfort_type <> 'none' and not coalesce((fs->>'discomfortMultiple')::boolean, false)
     and exists (select 1 from discomfort_selections where activity_record_id = new.activity_record_id and discomfort_type <> 'none') then
    raise exception 'esta avaliação aceita apenas um tipo de desconforto';
  end if;
  return new;
end $$;

-- Auditoria (doc 03 §8): somente metadados, sem conteúdo clínico.
create function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare org uuid; eid uuid; act text; meta jsonb := '{}'::jsonb; r jsonb; o jsonb; ast text;
begin
  r := to_jsonb(coalesce(new, old));
  o := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  eid := (r->>'id')::uuid;
  if tg_table_name = 'assessments' then
    org := (r->>'organization_id')::uuid;
    if tg_op = 'INSERT' then act := 'assessment.created';
    elsif o->>'status' is distinct from r->>'status' then
      act := 'assessment.status_changed'; meta := jsonb_build_object('from', o->>'status', 'to', r->>'status');
    else return null; end if;
  elsif tg_table_name = 'assessment_links' then
    org := assessment_org((r->>'assessment_id')::uuid);
    if tg_op = 'INSERT' then act := 'link.created'; meta := jsonb_build_object('expires_at', r->>'expires_at');
    elsif o->>'revoked_at' is null and r->>'revoked_at' is not null then act := 'link.revoked';
    else return null; end if;
  elsif tg_table_name = 'activity_records' then
    org := assessment_org((r->>'assessment_id')::uuid);
    select status into ast from assessments where id = (r->>'assessment_id')::uuid;
    if ast is null or ast not in ('submitted','under_review','finalized') then return null; end if;
    act := 'record.changed_after_submit'; meta := jsonb_build_object('op', tg_op, 'assessment_status', ast);
  elsif tg_table_name = 'occupations' then
    if r->>'origin' <> 'custom' then return null; end if;
    org := (r->>'owner_organization_id')::uuid; act := 'catalog.custom_' || lower(tg_op);
  elsif tg_table_name = 'assessment_templates' then
    org := (r->>'organization_id')::uuid; act := 'template.' || lower(tg_op);
  elsif tg_table_name = 'assessment_reports' then
    org := assessment_org((r->>'assessment_id')::uuid); act := 'report.created'; meta := jsonb_build_object('report_type', r->>'report_type');
  elsif tg_table_name = 'assessment_notes' then
    org := assessment_org((r->>'assessment_id')::uuid); act := 'note.' || lower(tg_op);
  elsif tg_table_name = 'response_sessions' then
    org := assessment_org((r->>'assessment_id')::uuid);
    if tg_op = 'INSERT' then act := 'response.started'; meta := jsonb_build_object('respondent_type', r->>'respondent_type');
    elsif o->>'status' = 'in_progress' and r->>'status' = 'submitted' then act := 'response.submitted';
    else return null; end if;
  else return null; end if;
  insert into audit_events(organization_id, actor_id, entity_type, entity_id, action, metadata)
  values (org, auth.uid(), tg_table_name, eid, act, meta);
  return null;
end $$;

create trigger trg_patients_actor    before insert on patients             for each row execute function force_actor('created_by');
create trigger trg_assess_actor      before insert on assessments          for each row execute function force_actor('created_by');
create trigger trg_templates_actor   before insert on assessment_templates for each row execute function force_actor('created_by');
create trigger trg_reports_actor     before insert on assessment_reports   for each row execute function force_actor('created_by');
create trigger trg_notes_actor       before insert on assessment_notes     for each row execute function force_actor('author_id');
create trigger trg_links_actor       before insert on assessment_links     for each row execute function force_actor('created_by');
create trigger trg_occ_actor         before insert on occupations          for each row execute function force_actor('created_by');

create trigger trg_patients_touch  before update on patients            for each row execute function touch_updated_at();
create trigger trg_assess_touch    before update on assessments         for each row execute function touch_updated_at();
create trigger trg_records_touch   before update on activity_records    for each row execute function touch_updated_at();
create trigger trg_notes_touch     before update on assessment_notes    for each row execute function touch_updated_at();

create trigger trg_patients_lock   before update on patients            for each row execute function lock_columns('organization_id');
create trigger trg_assess_lock     before update on assessments         for each row execute function lock_columns('organization_id','patient_id','created_by');
create trigger trg_resp_lock       before update on respondents         for each row execute function lock_columns('organization_id','patient_id');
create trigger trg_sessions_lock   before update on response_sessions   for each row execute function lock_columns('assessment_id');
create trigger trg_records_lock    before update on activity_records    for each row execute function lock_columns('assessment_id','response_session_id','occupation_id');
create trigger trg_notes_lock      before update on assessment_notes    for each row execute function lock_columns('assessment_id','author_id');
create trigger trg_templates_lock  before update on assessment_templates for each row execute function lock_columns('organization_id');
create trigger trg_occ_lock        before update on occupations         for each row execute function lock_columns('origin','owner_organization_id','stable_key');

create trigger trg_assess_guard    before insert or update on assessments       for each row execute function assessments_guard();
create trigger trg_records_guard   before insert or update on activity_records  for each row execute function records_guard();
create trigger trg_discomfort      before insert on discomfort_selections        for each row execute function discomfort_guard();

create trigger trg_audit_assess    after insert or update on assessments          for each row execute function audit_row();
create trigger trg_audit_links     after insert or update on assessment_links     for each row execute function audit_row();
create trigger trg_audit_records   after update or delete on activity_records     for each row execute function audit_row();
create trigger trg_audit_occ       after insert or update on occupations          for each row execute function audit_row();
create trigger trg_audit_templates after insert or update on assessment_templates for each row execute function audit_row();
create trigger trg_audit_reports   after insert on assessment_reports             for each row execute function audit_row();
create trigger trg_audit_notes     after insert or update on assessment_notes     for each row execute function audit_row();
create trigger trg_audit_sessions  after insert or update on response_sessions    for each row execute function audit_row();

-- ───────────────────────── RLS ─────────────────────────
alter table organizations          enable row level security;
alter table professionals          enable row level security;
alter table organization_members   enable row level security;
alter table patients               enable row level security;
alter table respondents            enable row level security;
alter table occupational_areas     enable row level security;
alter table occupations            enable row level security;
alter table assessment_templates   enable row level security;
alter table template_occupations   enable row level security;
alter table assessments            enable row level security;
alter table assessment_links       enable row level security;
alter table response_sessions      enable row level security;
alter table activity_records       enable row level security;
alter table discomfort_selections  enable row level security;
alter table assessment_notes       enable row level security;
alter table assessment_reports     enable row level security;
alter table audit_events           enable row level security;
alter table link_access_failures   enable row level security; -- sem políticas: ninguém lê pela API

create policy org_select on organizations for select to authenticated using (is_org_member(id));
create policy org_update on organizations for update to authenticated using (is_org_admin(id)) with check (is_org_admin(id));

create policy prof_select on professionals for select to authenticated using (id = auth.uid() or shares_org_with(id));
create policy prof_insert on professionals for insert to authenticated with check (id = auth.uid());
create policy prof_update on professionals for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy mem_select on organization_members for select to authenticated using (is_org_member(organization_id));
create policy mem_insert on organization_members for insert to authenticated
  with check (is_org_admin(organization_id) and (role <> 'owner' or org_role(organization_id) = 'owner'));
create policy mem_update on organization_members for update to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id) and (role <> 'owner' or org_role(organization_id) = 'owner'));
create policy mem_delete on organization_members for delete to authenticated using (is_org_admin(organization_id));

create policy pat_select on patients for select to authenticated using (is_org_member(organization_id));
create policy pat_insert on patients for insert to authenticated with check (can_write_org(organization_id));
create policy pat_update on patients for update to authenticated using (can_write_org(organization_id)) with check (can_write_org(organization_id));
create policy pat_delete on patients for delete to authenticated using (is_org_admin(organization_id));

create policy resp_select on respondents for select to authenticated using (is_org_member(organization_id));
create policy resp_insert on respondents for insert to authenticated
  with check (can_write_org(organization_id) and patient_org(patient_id) = organization_id);
create policy resp_update on respondents for update to authenticated using (can_write_org(organization_id)) with check (can_write_org(organization_id));
create policy resp_delete on respondents for delete to authenticated using (can_write_org(organization_id));

create policy area_select on occupational_areas for select to authenticated using (true);

create policy occ_select on occupations for select to authenticated
  using (origin = 'source_catalog' or is_org_member(owner_organization_id));
create policy occ_insert on occupations for insert to authenticated
  with check (origin = 'custom' and can_write_org(owner_organization_id));
create policy occ_update on occupations for update to authenticated
  using (origin = 'custom' and can_write_org(owner_organization_id))
  with check (origin = 'custom' and can_write_org(owner_organization_id));

create policy tpl_select on assessment_templates for select to authenticated using (is_org_member(organization_id));
create policy tpl_insert on assessment_templates for insert to authenticated with check (can_write_org(organization_id));
create policy tpl_update on assessment_templates for update to authenticated using (can_write_org(organization_id)) with check (can_write_org(organization_id));
create policy tpl_delete on assessment_templates for delete to authenticated using (can_write_org(organization_id));

create policy tocc_select on template_occupations for select to authenticated using (is_org_member(template_org(template_id)));
create policy tocc_insert on template_occupations for insert to authenticated with check (can_write_org(template_org(template_id)));
create policy tocc_update on template_occupations for update to authenticated using (can_write_org(template_org(template_id))) with check (can_write_org(template_org(template_id)));
create policy tocc_delete on template_occupations for delete to authenticated using (can_write_org(template_org(template_id)));

create policy asm_select on assessments for select to authenticated using (is_org_member(organization_id));
create policy asm_insert on assessments for insert to authenticated with check (can_write_org(organization_id));
create policy asm_update on assessments for update to authenticated using (can_write_org(organization_id)) with check (can_write_org(organization_id));

create policy link_select on assessment_links for select to authenticated using (is_org_member(assessment_org(assessment_id)));
-- Sem políticas de escrita: links só são criados/revogados pelas funções abaixo.

create policy sess_select on response_sessions for select to authenticated using (is_org_member(assessment_org(assessment_id)));
create policy sess_insert on response_sessions for insert to authenticated with check (can_write_org(assessment_org(assessment_id)));
create policy sess_update on response_sessions for update to authenticated using (can_write_org(assessment_org(assessment_id))) with check (can_write_org(assessment_org(assessment_id)));

create policy rec_select on activity_records for select to authenticated using (is_org_member(assessment_org(assessment_id)));
create policy rec_insert on activity_records for insert to authenticated with check (can_write_org(assessment_org(assessment_id)));
create policy rec_update on activity_records for update to authenticated using (can_write_org(assessment_org(assessment_id))) with check (can_write_org(assessment_org(assessment_id)));
create policy rec_delete on activity_records for delete to authenticated using (can_write_org(assessment_org(assessment_id)));

create policy disc_select on discomfort_selections for select to authenticated using (is_org_member(record_org(activity_record_id)));
create policy disc_insert on discomfort_selections for insert to authenticated with check (can_write_org(record_org(activity_record_id)));
create policy disc_delete on discomfort_selections for delete to authenticated using (can_write_org(record_org(activity_record_id)));

create policy note_select on assessment_notes for select to authenticated using (is_org_member(assessment_org(assessment_id)));
create policy note_insert on assessment_notes for insert to authenticated with check (can_write_org(assessment_org(assessment_id)));
create policy note_update on assessment_notes for update to authenticated using (can_write_org(assessment_org(assessment_id))) with check (can_write_org(assessment_org(assessment_id)));
create policy note_delete on assessment_notes for delete to authenticated using (can_write_org(assessment_org(assessment_id)));

create policy rep_select on assessment_reports for select to authenticated using (is_org_member(assessment_org(assessment_id)));
create policy rep_insert on assessment_reports for insert to authenticated with check (can_write_org(assessment_org(assessment_id)));

create policy audit_select on audit_events for select to authenticated using (is_org_member(organization_id));

-- ───────────────────────── Funções para profissionais autenticados ─────────────────────────
create function create_organization(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); org uuid;
begin
  if uid is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  insert into professionals(id, display_name) values (uid, coalesce(nullif(trim(p_display_name), ''), 'Profissional'))
    on conflict (id) do nothing;
  insert into organizations(name) values (p_name) returning id into org;
  insert into organization_members(organization_id, professional_id, role) values (org, uid, 'owner');
  return org;
end $$;

-- Token: 3 UUIDs v4 concatenados (≥ 360 bits aleatórios de gen_random_uuid()). Só o hash é guardado.
create function create_assessment_link(p_assessment uuid, p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a assessments; tok text; lid uuid;
begin
  select * into a from assessments where id = p_assessment;
  if not found or not can_write_org(a.organization_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if a.status in ('cancelled','finalized') then raise exception 'avaliação não aceita novos links'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'informe uma validade futura para o link'; end if;
  if p_expires_at > now() + interval '366 days' then raise exception 'validade máxima do link: 1 ano'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into assessment_links(assessment_id, token_hash, expires_at, created_by)
  values (p_assessment, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), p_expires_at, auth.uid())
  returning id into lid;
  if a.status = 'draft' then update assessments set status = 'sent' where id = p_assessment; end if;
  return jsonb_build_object('link_id', lid, 'token', tok);
end $$;

create function revoke_assessment_link(p_link uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select assessment_org(assessment_id) into org from assessment_links where id = p_link;
  if org is null or not can_write_org(org) then raise exception 'sem permissão' using errcode = '42501'; end if;
  update assessment_links set revoked_at = coalesce(revoked_at, now()) where id = p_link;
end $$;

-- ───────────────────────── Gravação de registros (interno) ─────────────────────────
create function _upsert_record(p_assessment uuid, p_session uuid, r jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; st text := coalesce(r->>'status', 'not_answered');
begin
  insert into activity_records(
    assessment_id, response_session_id, occupation_id, occupation_snapshot, record_date, record_status,
    duration_minutes, occurrence_count, direct_total_minutes, frequency_value, frequency_unit, satisfaction,
    start_time, end_time, notes, entry_mode)
  values (
    p_assessment, p_session, (r->>'occupation_id')::uuid, '{}'::jsonb, nullif(r->>'record_date','')::date, st,
    (r->>'duration_minutes')::integer, (r->>'occurrence_count')::numeric, (r->>'direct_total_minutes')::integer,
    (r->>'frequency_value')::numeric, nullif(r->>'frequency_unit',''), nullif(r->>'satisfaction',''),
    nullif(r->>'start_time','')::time, nullif(r->>'end_time','')::time, coalesce(r->>'notes',''),
    coalesce(nullif(r->>'entry_mode',''), 'by_activity'))
  on conflict (response_session_id, occupation_id, (coalesce(record_date, date '0001-01-01'))) do update set
    record_status = excluded.record_status, duration_minutes = excluded.duration_minutes,
    occurrence_count = excluded.occurrence_count, direct_total_minutes = excluded.direct_total_minutes,
    frequency_value = excluded.frequency_value, frequency_unit = excluded.frequency_unit,
    satisfaction = excluded.satisfaction, start_time = excluded.start_time, end_time = excluded.end_time,
    notes = excluded.notes, entry_mode = excluded.entry_mode
  returning id into rid;
  delete from discomfort_selections where activity_record_id = rid;
  insert into discomfort_selections(activity_record_id, discomfort_type)
  select rid, d from jsonb_array_elements_text(coalesce(r->'discomfort', '[]'::jsonb)) d;
  return rid;
end $$;

create function _save_records(p_assessment uuid, p_session uuid, p_records jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb; n integer := 0;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then raise exception 'registros inválidos'; end if;
  if jsonb_array_length(p_records) > 5000 then raise exception 'registros em excesso'; end if;
  for e in select * from jsonb_array_elements(p_records) loop
    perform _upsert_record(p_assessment, p_session, e); n := n + 1;
  end loop;
  return n;
end $$;

-- Profissional registrando respostas (entrevista/observação). Alterações após o envio geram auditoria.
create function pro_save_records(p_session uuid, p_records jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare s response_sessions; a assessments;
begin
  select * into s from response_sessions where id = p_session;
  if not found then raise exception 'sessão inexistente'; end if;
  select * into a from assessments where id = s.assessment_id;
  if not can_write_org(a.organization_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if a.status in ('finalized','cancelled') then raise exception 'avaliação encerrada'; end if;
  return _save_records(a.id, s.id, p_records);
end $$;

-- ───────────────────────── Portal por link (anônimo) ─────────────────────────
-- Retorna {error} em vez de lançar exceção, para registrar a falha sem desfazê-la.
create function _resolve_token(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l assessment_links; a assessments;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then
    insert into link_access_failures(reason) values ('malformed');
    return jsonb_build_object('error', 'invalid_link');
  end if;
  select * into l from assessment_links where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    insert into link_access_failures(reason) values ('unknown');
    return jsonb_build_object('error', 'invalid_link');
  end if;
  if l.revoked_at is not null then return jsonb_build_object('error', 'revoked_link'); end if;
  if l.expires_at is not null and l.expires_at <= now() then return jsonb_build_object('error', 'expired_link'); end if;
  select * into a from assessments where id = l.assessment_id;
  if a.status in ('cancelled','expired') then return jsonb_build_object('error', 'not_available'); end if;
  update assessment_links set last_used_at = now() where id = l.id;
  return jsonb_build_object('link_id', l.id, 'assessment_id', a.id, 'status', a.status);
end $$;

create function portal_open(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb := _resolve_token(p_token); a assessments; sess response_sessions; recs jsonb;
begin
  if t ? 'error' then return t; end if;
  select * into a from assessments where id = (t->>'assessment_id')::uuid;
  if a.status = 'draft' then return jsonb_build_object('error', 'not_available'); end if;
  if a.status in ('submitted','under_review','finalized') then
    return jsonb_build_object('submitted', true, 'assessment', jsonb_build_object('title', a.title));
  end if;
  select * into sess from response_sessions where assessment_id = a.id and status = 'in_progress' order by started_at desc limit 1;
  recs := '[]'::jsonb;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'occupation_id', r.occupation_id, 'record_date', r.record_date, 'status', r.record_status,
      'duration_minutes', r.duration_minutes, 'occurrence_count', r.occurrence_count,
      'direct_total_minutes', r.direct_total_minutes, 'frequency_value', r.frequency_value,
      'frequency_unit', r.frequency_unit, 'satisfaction', r.satisfaction,
      'start_time', to_char(r.start_time, 'HH24:MI'), 'end_time', to_char(r.end_time, 'HH24:MI'),
      'notes', r.notes, 'entry_mode', r.entry_mode,
      'discomfort', coalesce((select jsonb_agg(d.discomfort_type order by d.discomfort_type)
                              from discomfort_selections d where d.activity_record_id = r.id), '[]'::jsonb))), '[]'::jsonb)
    into recs from activity_records r where r.response_session_id = sess.id;
  end if;
  -- Não expõe nome, nascimento nem qualquer dado do paciente.
  return jsonb_build_object(
    'assessment', jsonb_build_object(
      'title', a.title, 'target_type', a.target_type, 'fill_formats', a.fill_formats,
      'start_date', a.start_date, 'end_date', a.end_date, 'instructions', a.instructions,
      'expected_respondent', a.expected_respondent, 'expected_source', a.expected_source,
      'catalog_snapshot', a.catalog_snapshot, 'field_snapshot', a.field_snapshot, 'status', a.status),
    'session', case when sess.id is null then null else jsonb_build_object(
      'id', sess.id, 'respondent_type', sess.respondent_type, 'respondent_name', sess.respondent_name,
      'relationship_to_patient', sess.relationship_to_patient, 'guardian_mode', sess.guardian_mode,
      'source_of_information', sess.source_of_information, 'respondent_notes', sess.respondent_notes) end,
    'records', recs);
end $$;

create function portal_start_session(
  p_token text, p_respondent_type text, p_name text, p_relationship text,
  p_guardian_mode text, p_source text, p_privacy_accepted boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb := _resolve_token(p_token); a assessments; sid uuid;
begin
  if t ? 'error' then return t; end if;
  if not coalesce(p_privacy_accepted, false) then return jsonb_build_object('error', 'privacy_required'); end if;
  select * into a from assessments where id = (t->>'assessment_id')::uuid;
  if a.status not in ('sent','in_progress') then return jsonb_build_object('error', 'not_available'); end if;
  select id into sid from response_sessions where assessment_id = a.id and status = 'in_progress' order by started_at desc limit 1;
  if sid is null then
    insert into response_sessions(assessment_id, respondent_type, respondent_name, relationship_to_patient,
                                  guardian_mode, source_of_information, privacy_accepted_at)
    values (a.id, p_respondent_type, left(p_name, 200), left(p_relationship, 200),
            case when p_respondent_type in ('guardian','joint') then nullif(p_guardian_mode, '') end,
            p_source, now())
    returning id into sid;
    update assessments set status = 'in_progress' where id = a.id and status = 'sent';
  else
    update response_sessions set respondent_type = p_respondent_type, respondent_name = left(p_name, 200),
      relationship_to_patient = left(p_relationship, 200),
      guardian_mode = case when p_respondent_type in ('guardian','joint') then nullif(p_guardian_mode, '') end,
      source_of_information = p_source where id = sid;
  end if;
  return jsonb_build_object('session_id', sid);
end $$;

create function portal_save_records(p_token text, p_session uuid, p_records jsonb, p_respondent_notes text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb := _resolve_token(p_token); a assessments; s response_sessions; n integer;
begin
  if t ? 'error' then return t; end if;
  select * into a from assessments where id = (t->>'assessment_id')::uuid;
  if a.status not in ('sent','in_progress') then return jsonb_build_object('error', 'not_available'); end if;
  select * into s from response_sessions where id = p_session and assessment_id = a.id and status = 'in_progress';
  if not found then return jsonb_build_object('error', 'invalid_session'); end if;
  n := _save_records(a.id, s.id, p_records);
  if p_respondent_notes is not null then
    update response_sessions set respondent_notes = left(p_respondent_notes, 4000) where id = s.id;
  end if;
  return jsonb_build_object('saved', n);
end $$;

create function portal_submit(p_token text, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb := _resolve_token(p_token); a assessments; s response_sessions;
begin
  if t ? 'error' then return t; end if;
  select * into a from assessments where id = (t->>'assessment_id')::uuid;
  if a.status not in ('sent','in_progress') then return jsonb_build_object('error', 'not_available'); end if;
  select * into s from response_sessions where id = p_session and assessment_id = a.id and status = 'in_progress';
  if not found then return jsonb_build_object('error', 'invalid_session'); end if;
  update response_sessions set status = 'submitted', submitted_at = now() where id = s.id;
  update assessments set status = 'submitted', submitted_at = now() where id = a.id;
  return jsonb_build_object('submitted', true);
end $$;

-- ───────────────────────── Privilégios ─────────────────────────
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select, update                   on organizations         to authenticated;
grant select, insert, update, delete   on organization_members  to authenticated;
grant select, insert, update           on professionals         to authenticated;
grant select, insert, update, delete   on patients              to authenticated;
grant select, insert, update, delete   on respondents           to authenticated;
grant select                           on occupational_areas    to authenticated;
grant select, insert, update           on occupations           to authenticated;
grant select, insert, update, delete   on assessment_templates  to authenticated;
grant select, insert, update, delete   on template_occupations  to authenticated;
grant select, insert, update           on assessments           to authenticated;
grant select (id, assessment_id, expires_at, revoked_at, max_submissions, last_used_at, created_by, created_at)
                                       on assessment_links      to authenticated; -- sem token_hash
grant select, insert, update           on response_sessions     to authenticated;
grant select, insert, update, delete   on activity_records      to authenticated;
grant select, insert, delete           on discomfort_selections to authenticated;
grant select, insert, update, delete   on assessment_notes      to authenticated;
grant select, insert                   on assessment_reports    to authenticated;
grant select                           on audit_events          to authenticated;

grant execute on function org_role(uuid), is_org_member(uuid), can_write_org(uuid), is_org_admin(uuid),
  assessment_org(uuid), patient_org(uuid), template_org(uuid), record_org(uuid), shares_org_with(uuid) to authenticated;
grant execute on function create_organization(text, text), create_assessment_link(uuid, timestamptz),
  revoke_assessment_link(uuid), pro_save_records(uuid, jsonb) to authenticated;
grant execute on function portal_open(text), portal_start_session(text, text, text, text, text, text, boolean),
  portal_save_records(text, uuid, jsonb, text), portal_submit(text, uuid) to anon, authenticated;
