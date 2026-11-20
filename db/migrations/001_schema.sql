-- Orquestração Ocupacional — migração 001: schema (Supabase/PostgreSQL)
-- Base: docs/original/database/schema-inicial.sql, revisado conforme docs/decisoes/README.md
-- Mudanças em relação ao original: ADR-001 (frequency_value), ADR-003 (trigger de desconforto),
-- ADR-004 (chave única de registro), ADR-006 (guardian_mode), ADR-007 (respondent_notes), ADR-008 (parent_id).
-- Requer o schema `auth` do Supabase (auth.users, auth.uid()).

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table professionals (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  role text not null check (role in ('owner','admin','professional','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, professional_id)
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  created_by uuid not null references professionals(id),
  display_name text not null,
  birth_date date,
  patient_type text not null check (patient_type in ('adult','child','unspecified')),
  external_system text,
  external_patient_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_system, external_patient_id)
);

create table respondents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id) on delete cascade,
  display_name text,
  relationship_to_patient text,
  respondent_type text not null check (respondent_type in ('patient','guardian','professional','joint')),
  created_at timestamptz not null default now()
);

-- ADR-008: subáreas são áreas-filhas.
create table occupational_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  parent_id uuid references occupational_areas(id),
  name text not null,
  source_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table occupations (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references occupational_areas(id),
  subarea_id uuid references occupational_areas(id),
  parent_occupation_id uuid references occupations(id),
  stable_key text not null unique,
  name text not null,
  description text,
  origin text not null check (origin in ('source_catalog','custom')),
  source_file text,
  source_sheet text,
  source_row integer,
  source_number integer, -- preserva duplicidade (94) e lacuna (95) da planilha (ADR-009)
  owner_organization_id uuid references organizations(id),
  created_by uuid references professionals(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (origin = 'source_catalog' and owner_organization_id is null)
    or (origin = 'custom' and owner_organization_id is not null)
  )
);

create table assessment_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  target_type text not null check (target_type in ('adult','child','both')),
  enabled_formats text[] not null default array['by_activity']::text[],
  field_config jsonb not null default '{}'::jsonb,
  created_by uuid not null references professionals(id),
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table template_occupations (
  template_id uuid not null references assessment_templates(id) on delete cascade,
  occupation_id uuid not null references occupations(id),
  sort_order integer not null default 0,
  primary key (template_id, occupation_id)
);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  patient_id uuid not null references patients(id),
  template_id uuid references assessment_templates(id),
  created_by uuid not null references professionals(id),
  title text not null,
  target_type text not null check (target_type in ('adult','child')),
  fill_formats text[] not null check (cardinality(fill_formats) > 0 and fill_formats <@ array['by_activity','weekly_routine']::text[]),
  start_date date not null,
  end_date date not null,
  expected_respondent text not null default 'patient' check (expected_respondent in ('patient','guardian','professional','joint')),
  expected_source text not null default 'self_report' check (expected_source in ('self_report','guardian_report','professional_observation','interview','mixed')),
  instructions text not null default '',
  methodology_version text not null default '',
  status text not null default 'draft'
    check (status in ('draft','sent','in_progress','submitted','under_review','finalized','expired','cancelled')),
  catalog_snapshot jsonb not null default '[]'::jsonb,
  field_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date < 62)
);

create table assessment_links (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  token_hash text not null unique, -- somente o hash SHA-256 (hex); o token nunca é guardado
  expires_at timestamptz,
  revoked_at timestamptz,
  max_submissions integer not null default 1 check (max_submissions > 0),
  last_used_at timestamptz,
  created_by uuid not null references professionals(id),
  created_at timestamptz not null default now()
);

create table response_sessions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  respondent_id uuid references respondents(id),
  respondent_type text not null check (respondent_type in ('patient','guardian','professional','joint')),
  respondent_name text,
  relationship_to_patient text,
  guardian_mode text check (guardian_mode in ('guardian_alone','guardian_with_child','child_with_help')), -- ADR-006
  source_of_information text not null check (source_of_information in ('self_report','guardian_report','professional_observation','interview','mixed')),
  respondent_notes text not null default '', -- ADR-007
  privacy_accepted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table activity_records (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  response_session_id uuid not null references response_sessions(id) on delete cascade,
  occupation_id uuid references occupations(id),
  occupation_snapshot jsonb not null,
  record_date date,
  record_status text not null check (record_status in ('performed','not_performed','not_applicable','unknown','not_answered')),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  occurrence_count numeric(10,2) check (occurrence_count is null or occurrence_count >= 0),
  direct_total_minutes integer check (direct_total_minutes is null or direct_total_minutes >= 0),
  frequency_value numeric(10,2) check (frequency_value is null or frequency_value >= 0), -- ADR-001
  frequency_unit text check (frequency_unit in ('day','week','month','year')),
  satisfaction text check (satisfaction in ('satisfied','dissatisfied')),
  start_time time,
  end_time time,
  notes text not null default '' check (length(notes) <= 2000),
  entry_mode text not null check (entry_mode in ('by_activity','weekly_routine','professional_interview')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (record_status = 'not_applicable' and (coalesce(duration_minutes,0) > 0 or coalesce(direct_total_minutes,0) > 0))),
  check (not (record_status = 'not_performed' and (coalesce(duration_minutes,0) > 0 or coalesce(direct_total_minutes,0) > 0))),
  check ((frequency_value is null) = (frequency_unit is null))
);

-- ADR-004: um registro por (sessão, atividade, data); NULL = registro do período.
create unique index uq_activity_record_key
  on activity_records (response_session_id, occupation_id, (coalesce(record_date, date '0001-01-01')));

create table discomfort_selections (
  activity_record_id uuid not null references activity_records(id) on delete cascade,
  discomfort_type text not null check (discomfort_type in ('physical','mental','sensory','none')),
  primary key (activity_record_id, discomfort_type)
);

create table assessment_notes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  author_id uuid not null references professionals(id),
  note_type text not null check (note_type in ('professional_analysis','report_text')), -- ADR-007
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assessment_reports (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  created_by uuid not null references professionals(id),
  report_type text not null check (report_type in ('visual','descriptive','complete','summary')),
  storage_path text,
  data_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Metadados mínimos; nunca copiar conteúdo clínico para cá (doc 03 §8).
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Tentativas de token inválido (apoio ao rate limiting — pendência P-11). Sem token e sem dado pessoal.
create table link_access_failures (
  id bigint generated always as identity primary key,
  reason text not null,
  attempted_at timestamptz not null default now()
);

create index idx_patients_org on patients(organization_id);
create index idx_assessments_patient on assessments(patient_id, created_at desc);
create index idx_assessments_org_status on assessments(organization_id, status);
create index idx_activity_records_assessment on activity_records(assessment_id, record_date);
create index idx_links_assessment on assessment_links(assessment_id);
create index idx_audit_org on audit_events(organization_id, created_at desc);
create index idx_occupations_area on occupations(area_id);
