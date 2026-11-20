// Testes de segurança do doc 04 §4 + regras de dados do banco (RLS, triggers, portal por link).
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './harness'

type Db = Awaited<ReturnType<typeof createDb>>
let h: Db
let A: string, B: string, V: string, P: string // donos de org A, org B, viewer de A, profissional de A
let orgA: string, orgB: string, patientA: string, patientB: string
let occs: { id: string; stable_key: string; name: string }[]

const asA = (q: string, p: unknown[] = []) => h.run('authenticated', A, q, p)
const asB = (q: string, p: unknown[] = []) => h.run('authenticated', B, q, p)
const asV = (q: string, p: unknown[] = []) => h.run('authenticated', V, q, p)
const asP = (q: string, p: unknown[] = []) => h.run('authenticated', P, q, p)
const anon = (q: string, p: unknown[] = []) => h.run('anon', null, q, p)
const root = (q: string, p: unknown[] = []) => h.run(null, null, q, p)

const FS = { fields: {}, discomfortMultiple: false }
async function newAssessment(fieldSnapshot: object = FS) {
  const snap = occs.slice(0, 2).map((o) => ({ occupationId: o.id, stableKey: o.stable_key, name: o.name, areaCode: 'avd', areaName: 'AVD' }))
  const [a] = await asA(
    `insert into assessments(organization_id, patient_id, created_by, title, target_type, fill_formats, start_date, end_date, catalog_snapshot, field_snapshot)
     values ($1, $2, $3, 'Avaliação teste', 'adult', '{by_activity,weekly_routine}', '2026-11-02', '2026-11-08', $4::jsonb, $5::jsonb) returning id`,
    [orgA, patientA, B /* tentativa de forjar autor: deve ser ignorada */, JSON.stringify(snap), JSON.stringify(fieldSnapshot)])
  const [l] = await asA(`select create_assessment_link($1, now() + interval '7 days') as r`, [a.id])
  return { id: a.id as string, token: l.r.token as string, linkId: l.r.link_id as string }
}
async function startSession(token: string) {
  const [r] = await anon(`select portal_start_session($1,'patient','Fulano','', null,'self_report', true) as r`, [token])
  return r.r.session_id as string
}
const rec = (occ: string, over: object = {}) => ({ occupation_id: occ, record_date: null, status: 'performed', direct_total_minutes: 30, ...over })

beforeAll(async () => {
  h = await createDb()
  ;[A, B, V, P] = [await h.newUser(), await h.newUser(), await h.newUser(), await h.newUser()]
  orgA = (await asA(`select create_organization('Clínica A', 'Prof A') as id`))[0].id
  orgB = (await asB(`select create_organization('Clínica B', 'Prof B') as id`))[0].id
  for (const u of [V, P]) await h.run('authenticated', u, `insert into professionals(id, display_name) values ($1, 'x')`, [u])
  await asA(`insert into organization_members values ($1, $2, 'viewer')`, [orgA, V])
  await asA(`insert into organization_members values ($1, $2, 'professional')`, [orgA, P])
  patientA = (await asA(`insert into patients(organization_id, created_by, display_name, patient_type) values ($1, $2, 'Maria Segredo', 'adult') returning id`, [orgA, B]))[0].id
  patientB = (await asB(`insert into patients(organization_id, created_by, display_name, patient_type) values ($1, $2, 'João B', 'child') returning id`, [orgB, B]))[0].id
  occs = await root(`select id, stable_key, name from occupations order by source_row limit 3`)
})

describe('catálogo importado', () => {
  it('100 atividades originais, 94 duplicado e sem 95; Lazer com 3 subáreas', async () => {
    expect((await root(`select count(*)::int n from occupations where origin='source_catalog'`))[0].n).toBe(100)
    expect((await root(`select count(*)::int n from occupations where source_number = 94`))[0].n).toBe(2)
    expect((await root(`select count(*)::int n from occupations where source_number = 95`))[0].n).toBe(0)
    expect((await root(`select count(*)::int n from occupational_areas where parent_id = (select id from occupational_areas where code='lazer')`))[0].n).toBe(3)
  })
  it('catálogo original não pode ser alterado por profissionais', async () => {
    expect(await asA(`update occupations set name = 'X' where origin='source_catalog' returning id`)).toHaveLength(0)
    expect((await root(`select name from occupations where stable_key='orig-row-011'`))[0].name).toBe('Banho')
  })
  it('atividade personalizada é da organização e invisível para outra', async () => {
    const area = (await root(`select id from occupational_areas where code='avd'`))[0].id
    await asA(`insert into occupations(area_id, stable_key, name, origin, owner_organization_id) values ($1,'custom-a-1','Regar plantas','custom',$2)`, [area, orgA])
    expect((await asA(`select 1 from occupations where stable_key='custom-a-1'`)).length).toBe(1)
    expect((await asB(`select 1 from occupations where stable_key='custom-a-1'`)).length).toBe(0)
    await expect(asB(`insert into occupations(area_id, stable_key, name, origin, owner_organization_id) values ($1,'custom-x','Y','custom',$2)`, [area, orgA])).rejects.toThrow(/row-level security/)
  })
})

describe('doc 04 §4 — acesso anônimo e isolamento', () => {
  it('anônimo não consulta tabelas clínicas diretamente', async () => {
    for (const t of ['patients', 'assessments', 'activity_records', 'response_sessions', 'assessment_links', 'audit_events', 'link_access_failures', 'organizations'])
      await expect(anon(`select * from ${t}`)).rejects.toThrow(/permission denied/)
    await expect(anon(`insert into response_sessions(assessment_id, respondent_type, source_of_information) values (gen_random_uuid(),'patient','self_report')`)).rejects.toThrow(/permission denied/)
  })
  it('anônimo não chama funções de profissional', async () => {
    await expect(anon(`select create_assessment_link(gen_random_uuid(), now() + interval '1 day')`)).rejects.toThrow(/permission denied/)
    await expect(anon(`select pro_save_records(gen_random_uuid(), '[]'::jsonb)`)).rejects.toThrow(/permission denied/)
    await expect(anon(`select _upsert_record(gen_random_uuid(), gen_random_uuid(), '{}'::jsonb)`)).rejects.toThrow(/permission denied/)
  })
  it('profissional de outra organização não vê nem altera dados', async () => {
    const a = await newAssessment()
    expect(await asB(`select * from patients where id = $1`, [patientA])).toHaveLength(0)
    expect(await asB(`select * from assessments where id = $1`, [a.id])).toHaveLength(0)
    expect(await asB(`select * from audit_events where organization_id = $1`, [orgA])).toHaveLength(0)
    await expect(asB(`insert into patients(organization_id, created_by, display_name, patient_type) values ($1,$2,'X','adult')`, [orgA, B])).rejects.toThrow(/row-level security/)
    await expect(asB(`select create_assessment_link($1, now() + interval '1 day')`, [a.id])).rejects.toThrow(/sem permissão/)
    await expect(asB(`select revoke_assessment_link($1)`, [a.linkId])).rejects.toThrow(/sem permissão/)
    expect(await asB(`update patients set display_name='hack' where id=$1 returning id`, [patientA])).toHaveLength(0)
  })
  it('cliente não altera organization_id/patient_id nem forja autor', async () => {
    await expect(asA(`update patients set organization_id = $1 where id = $2`, [orgB, patientA])).rejects.toThrow(/campo imutável/)
    const a = await newAssessment()
    await expect(asA(`update assessments set patient_id = $1 where id = $2`, [patientB, a.id])).rejects.toThrow(/campo imutável/)
    await expect(asA(`update assessments set organization_id = $1 where id = $2`, [orgB, a.id])).rejects.toThrow()
    await expect(asA(`insert into assessments(organization_id, patient_id, created_by, title, target_type, fill_formats, start_date, end_date) values ($1,$2,$3,'t','adult','{by_activity}','2026-11-02','2026-11-03')`, [orgA, patientB, A])).rejects.toThrow(/paciente não pertence/)
    await expect(asA(`insert into assessments(organization_id, patient_id, created_by, title, target_type, fill_formats, start_date, end_date) values ($1,$2,$3,'t','adult','{by_activity}','2026-11-02','2026-11-03')`, [orgB, patientB, A])).rejects.toThrow(/row-level security/)
    expect((await root(`select created_by from patients where id = $1`, [patientA]))[0].created_by).toBe(A)
    expect((await root(`select created_by from assessments where id = $1`, [a.id]))[0].created_by).toBe(A)
  })
  it('viewer lê mas não escreve; profissional não administra membros', async () => {
    expect(await asV(`select * from patients where id = $1`, [patientA])).toHaveLength(1)
    await expect(asV(`insert into patients(organization_id, created_by, display_name, patient_type) values ($1,$2,'X','adult')`, [orgA, V])).rejects.toThrow(/row-level security/)
    await expect(asP(`insert into organization_members values ($1, $2, 'admin')`, [orgA, V])).rejects.toThrow(/row-level security/)
    expect(await asP(`insert into patients(organization_id, created_by, display_name, patient_type) values ($1,$2,'Ok','adult') returning id`, [orgA, P])).toHaveLength(1)
  })
})

describe('links individuais', () => {
  it('só o hash é guardado; token nunca aparece no banco; token_hash não é legível pelo cliente', async () => {
    const a = await newAssessment()
    const dump = JSON.stringify(await root(`select * from assessment_links where id = $1`, [a.linkId]))
    expect(dump).not.toContain(a.token)
    expect(a.token.length).toBeGreaterThanOrEqual(64)
    expect((await root(`select length(token_hash)::int n from assessment_links where id=$1`, [a.linkId]))[0].n).toBe(64)
    await expect(asA(`select token_hash from assessment_links`)).rejects.toThrow(/permission denied/)
    expect(await asA(`select id, expires_at from assessment_links where id=$1`, [a.linkId])).toHaveLength(1)
    await expect(asA(`insert into assessment_links(assessment_id, token_hash, created_by) values ($1,'x',$2)`, [a.id, A])).rejects.toThrow(/permission denied/)
  })
  it('exige validade futura e máxima de 1 ano', async () => {
    const a = await newAssessment()
    await expect(asA(`select create_assessment_link($1, null)`, [a.id])).rejects.toThrow(/validade/)
    await expect(asA(`select create_assessment_link($1, now() - interval '1 day')`, [a.id])).rejects.toThrow(/validade/)
    await expect(asA(`select create_assessment_link($1, now() + interval '400 days')`, [a.id])).rejects.toThrow(/validade máxima/)
  })
  it('token inválido/curto não acessa e a tentativa é registrada', async () => {
    const before = (await root(`select count(*)::int n from link_access_failures`))[0].n
    expect((await anon(`select portal_open('abc') as r`))[0].r.error).toBe('invalid_link')
    expect((await anon(`select portal_open($1) as r`, ['x'.repeat(64)]))[0].r.error).toBe('invalid_link')
    expect((await root(`select count(*)::int n from link_access_failures`))[0].n).toBe(before + 2)
  })
  it('token expirado não acessa', async () => {
    const a = await newAssessment()
    await root(`update assessment_links set expires_at = now() - interval '1 minute' where id = $1`, [a.linkId])
    expect((await anon(`select portal_open($1) as r`, [a.token]))[0].r.error).toBe('expired_link')
    expect((await anon(`select portal_start_session($1,'patient','a','',null,'self_report',true) as r`, [a.token]))[0].r.error).toBe('expired_link')
  })
  it('token revogado perde acesso imediatamente e a revogação é auditada', async () => {
    const a = await newAssessment()
    expect((await anon(`select portal_open($1) as r`, [a.token]))[0].r.assessment.title).toBe('Avaliação teste')
    await asA(`select revoke_assessment_link($1)`, [a.linkId])
    expect((await anon(`select portal_open($1) as r`, [a.token]))[0].r.error).toBe('revoked_link')
    expect((await root(`select count(*)::int n from audit_events where action='link.revoked' and organization_id=$1`, [orgA]))[0].n).toBeGreaterThan(0)
  })
  it('portal não expõe dados do paciente', async () => {
    const a = await newAssessment()
    const r = (await anon(`select portal_open($1) as r`, [a.token]))[0].r
    expect(JSON.stringify(r)).not.toMatch(/Maria|Segredo|patient_id|organization_id|birth/)
  })
})

describe('portal: preenchimento, rascunho e envio', () => {
  it('fluxo completo: iniciar, salvar, retomar sem duplicar, enviar, bloquear depois', async () => {
    const a = await newAssessment()
    expect((await anon(`select portal_start_session($1,'patient','F','',null,'self_report', false) as r`, [a.token]))[0].r.error).toBe('privacy_required')
    const sid = await startSession(a.token)
    expect((await root(`select status from assessments where id=$1`, [a.id]))[0].status).toBe('in_progress')
    const save = (recs: object[]) => anon(`select portal_save_records($1,$2,$3::jsonb,'observação geral') as r`, [a.token, sid, JSON.stringify(recs)])
    expect((await save([rec(occs[0].id, { discomfort: ['physical'], satisfaction: 'satisfied', notes: 'ok' }), rec(occs[1].id, { status: 'not_performed', direct_total_minutes: null })]))[0].r.saved).toBe(2)
    await save([rec(occs[0].id, { direct_total_minutes: 45, discomfort: ['mental'] })]) // atualiza o mesmo registro
    expect((await root(`select count(*)::int n from activity_records where response_session_id=$1`, [sid]))[0].n).toBe(2)
    const open = (await anon(`select portal_open($1) as r`, [a.token]))[0].r
    expect(open.session.id).toBe(sid)
    expect(open.session.respondent_notes).toBe('observação geral')
    const r0 = open.records.find((r: any) => r.occupation_id === occs[0].id)
    expect(r0).toMatchObject({ direct_total_minutes: 45, discomfort: ['mental'] })
    expect((await anon(`select portal_submit($1,$2) as r`, [a.token, sid]))[0].r.submitted).toBe(true)
    expect((await root(`select status, submitted_at is not null as ok from assessments where id=$1`, [a.id]))[0]).toMatchObject({ status: 'submitted', ok: true })
    expect((await save([rec(occs[0].id)]))[0].r.error).toBe('not_available')
    expect((await anon(`select portal_open($1) as r`, [a.token]))[0].r.submitted).toBe(true)
    expect((await root(`select count(*)::int n from audit_events where action='response.submitted' and entity_id=$1`, [sid]))[0].n).toBe(1)
  })
  it('registra respondente, relação e modo do responsável', async () => {
    const a = await newAssessment()
    const [r] = await anon(`select portal_start_session($1,'guardian','Ana','mãe','child_with_help','guardian_report', true) as r`, [a.token])
    expect((await root(`select respondent_type, relationship_to_patient, guardian_mode, source_of_information, privacy_accepted_at is not null as ok from response_sessions where id=$1`, [r.r.session_id]))[0])
      .toMatchObject({ respondent_type: 'guardian', relationship_to_patient: 'mãe', guardian_mode: 'child_with_help', source_of_information: 'guardian_report', ok: true })
  })
  it('rejeita atividade fora da avaliação, estados incoerentes e desconforto inválido', async () => {
    const a = await newAssessment(), sid = await startSession(a.token)
    const save = (recs: object[]) => anon(`select portal_save_records($1,$2,$3::jsonb) as r`, [a.token, sid, JSON.stringify(recs)])
    await expect(save([rec(occs[2].id)])).rejects.toThrow(/não faz parte desta avaliação/)
    await expect(save([rec(occs[0].id, { status: 'not_performed' })])).rejects.toThrow(/check/i)
    await expect(save([rec(occs[0].id, { status: 'not_applicable', direct_total_minutes: 5 })])).rejects.toThrow(/check/i)
    await expect(save([rec(occs[0].id, { direct_total_minutes: -1 })])).rejects.toThrow(/check/i)
    await expect(save([rec(occs[0].id, { discomfort: ['none', 'physical'] })])).rejects.toThrow(/Sem desconforto/)
    await expect(save([rec(occs[0].id, { discomfort: ['physical', 'mental'] })])).rejects.toThrow(/apenas um tipo/)
    await expect(save([rec(occs[0].id, { frequency_value: 3 })])).rejects.toThrow(/check/i)
    expect((await root(`select count(*)::int n from activity_records where assessment_id=$1`, [a.id]))[0].n).toBe(0)
  })
  it('múltiplos desconfortos só quando habilitado na avaliação', async () => {
    const a = await newAssessment({ fields: {}, discomfortMultiple: true }), sid = await startSession(a.token)
    expect((await anon(`select portal_save_records($1,$2,$3::jsonb) as r`, [a.token, sid, JSON.stringify([rec(occs[0].id, { discomfort: ['physical', 'sensory'] })])]))[0].r.saved).toBe(1)
    await expect(anon(`select portal_save_records($1,$2,$3::jsonb) as r`, [a.token, sid, JSON.stringify([rec(occs[1].id, { discomfort: ['none', 'sensory'] })])])).rejects.toThrow(/Sem desconforto/)
  })
  it('sessão de outra avaliação não é aceita', async () => {
    const a = await newAssessment(), b = await newAssessment()
    const sidB = await startSession(b.token)
    expect((await anon(`select portal_save_records($1,$2,'[]'::jsonb) as r`, [a.token, sidB]))[0].r.error).toBe('invalid_session')
    expect((await anon(`select portal_submit($1,$2) as r`, [a.token, sidB]))[0].r.error).toBe('invalid_session')
  })
})

describe('histórico, auditoria e logs', () => {
  it('avaliação enviada é imutável (período e snapshots) e alterações pós-envio geram auditoria sem conteúdo clínico', async () => {
    const a = await newAssessment(), sid = await startSession(a.token)
    await anon(`select portal_save_records($1,$2,$3::jsonb) as r`, [a.token, sid, JSON.stringify([rec(occs[0].id, { notes: 'CONTEUDO-CLINICO-SIGILOSO' })])])
    await anon(`select portal_submit($1,$2)`, [a.token, sid])
    await expect(asA(`update assessments set start_date = '2026-10-01' where id=$1`, [a.id])).rejects.toThrow(/imutável/)
    await expect(asA(`update assessments set catalog_snapshot = '[]'::jsonb where id=$1`, [a.id])).rejects.toThrow(/imutável/)
    await asA(`select pro_save_records($1,$2::jsonb)`, [sid, JSON.stringify([rec(occs[0].id, { direct_total_minutes: 99, notes: 'CONTEUDO-CLINICO-SIGILOSO' })])])
    const ev = await root(`select * from audit_events where action='record.changed_after_submit' and organization_id=$1`, [orgA])
    expect(ev.length).toBeGreaterThan(0)
    expect(ev[0].actor_id).toBe(A)
    const all = JSON.stringify(await root(`select * from audit_events`))
    expect(all).not.toContain('CONTEUDO-CLINICO-SIGILOSO')
    for (const t of [a.token]) expect(all).not.toContain(t)
  })
  it('profissional registra respostas como entrevista; viewer não', async () => {
    const a = await newAssessment()
    const [s] = await asA(`insert into response_sessions(assessment_id, respondent_type, source_of_information) values ($1,'professional','interview') returning id`, [a.id])
    expect((await asA(`select pro_save_records($1,$2::jsonb) as n`, [s.id, JSON.stringify([rec(occs[0].id, { entry_mode: 'professional_interview' })])]))[0].n).toBe(1)
    await expect(asV(`select pro_save_records($1,'[]'::jsonb)`, [s.id])).rejects.toThrow(/sem permissão/)
    await expect(asV(`insert into response_sessions(assessment_id, respondent_type, source_of_information) values ($1,'professional','interview')`, [a.id])).rejects.toThrow(/row-level security/)
  })
  it('auditoria é somente leitura para clientes', async () => {
    await expect(asA(`insert into audit_events(organization_id, entity_type, action) values ($1,'x','y')`, [orgA])).rejects.toThrow(/permission denied/)
    await expect(asA(`delete from audit_events`)).rejects.toThrow(/permission denied/)
    expect((await asA(`select count(*)::int n from audit_events where action='assessment.created'`))[0].n).toBeGreaterThan(0)
  })
  it('avaliação cancelada não gera link nem reabre', async () => {
    const a = await newAssessment()
    await asA(`update assessments set status='cancelled' where id=$1`, [a.id])
    await expect(asA(`select create_assessment_link($1, now() + interval '1 day')`, [a.id])).rejects.toThrow(/não aceita novos links/)
    await expect(asA(`update assessments set status='draft' where id=$1`, [a.id])).rejects.toThrow(/cancelada/)
    expect((await anon(`select portal_open($1) as r`, [a.token]))[0].r.error).toBe('not_available')
  })
})
