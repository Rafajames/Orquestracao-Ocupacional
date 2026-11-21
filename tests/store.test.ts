// Contrato do portal no modo local: mesmo comportamento das funções portal_* do SQL.
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultFieldConfig } from '../src/domain/catalog'
import { activeOccupations, getState, portalApi, pro, recordsOfSession, referenceSession, type RecordInput } from '../src/data/store'
import { emptyRecord } from '../src/components/RecordEditor'

let pid: string
const base = {
  title: 'Teste', targetType: 'adult' as const, formats: ['by_activity' as const], startDate: '2026-11-02', endDate: '2026-11-08',
  expectedRespondent: 'patient' as const, expectedSource: 'self_report' as const, instructions: '',
}
async function setup(cfg = defaultFieldConfig()) {
  const occ = activeOccupations().slice(0, 2).map((o) => o.id)
  const id = pro.createAssessment({ ...base, patientId: pid, occupationIds: occ, fieldConfig: cfg })
  const token = await pro.createLink(id, new Date(Date.now() + 864e5))
  return { id, token, occ }
}
const rec = (occ: string, p: Partial<RecordInput> = {}): RecordInput => ({ ...emptyRecord(occ, null), status: 'performed', directTotalMinutes: 30, ...p })
const start = (token: string) => portalApi.startSession(token, { respondentType: 'patient', name: 'F', relationship: '', guardianMode: null, source: 'self_report', privacyAccepted: true })

beforeAll(() => { pro.login('Teste'); pid = pro.addPatient({ displayName: 'Paciente Fictício', birthDate: null, patientType: 'adult' }) })

describe('modo local — portal por link', () => {
  it('guarda só o hash do token e não expõe o paciente', async () => {
    const { token, id } = await setup()
    expect(JSON.stringify(getState())).not.toContain(token)
    const o = await portalApi.open(token)
    expect('assessment' in o).toBe(true)
    expect(JSON.stringify(o)).not.toContain('Fictício')
    expect(getState().assessments.find((a) => a.id === id)!.status).toBe('sent')
  })
  it('token inválido, curto, expirado e revogado são recusados', async () => {
    expect(await portalApi.open('abc')).toEqual({ error: 'invalid_link' })
    expect(await portalApi.open('x'.repeat(60))).toEqual({ error: 'invalid_link' })
    const a = await setup()
    const link = getState().links.find((l) => l.assessmentId === a.id)!
    pro.revokeLink(link.id)
    expect(await portalApi.open(a.token)).toEqual({ error: 'revoked_link' })
    await expect(pro.createLink(a.id, new Date(Date.now() - 1000))).rejects.toThrow(/futuro/)
    await expect(pro.createLink(a.id, new Date(Date.now() + 400 * 864e5))).rejects.toThrow(/1 ano/)
    const b = await setup()
    const lb = getState().links.find((l) => l.assessmentId === b.id)!
    lb.expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(await portalApi.open(b.token)).toEqual({ error: 'expired_link' })
  })
  it('fluxo: privacidade obrigatória, salvar, retomar sem duplicar, enviar e bloquear', async () => {
    const { token, id, occ } = await setup()
    expect(await portalApi.startSession(token, { respondentType: 'patient', name: 'F', relationship: '', guardianMode: null, source: 'self_report', privacyAccepted: false })).toEqual({ error: 'privacy_required' })
    const s = await start(token); if ('error' in s) throw new Error('x')
    expect(getState().assessments.find((a) => a.id === id)!.status).toBe('in_progress')
    await portalApi.saveRecords(token, s.sessionId, [rec(occ[0], { discomfort: ['physical'] }), rec(occ[1], { status: 'not_performed', directTotalMinutes: null })], 'obs')
    await portalApi.saveRecords(token, s.sessionId, [rec(occ[0], { directTotalMinutes: 45 })])
    const again = await start(token); if ('error' in again) throw new Error('x')
    expect(again.sessionId).toBe(s.sessionId)
    const open = await portalApi.open(token); if (!('assessment' in open)) throw new Error('x')
    expect(open.records).toHaveLength(2)
    expect(open.records.find((r) => r.occupationId === occ[0])!.directTotalMinutes).toBe(45)
    expect(await portalApi.submit(token, s.sessionId)).toEqual({ submitted: true })
    expect(await portalApi.saveRecords(token, s.sessionId, [rec(occ[0])])).toEqual({ error: 'not_available' })
    expect(await portalApi.open(token)).toMatchObject({ submitted: true })
    expect(referenceSession(getState(), id)!.status).toBe('submitted')
    expect(recordsOfSession(getState(), s.sessionId)).toHaveLength(2)
  })
  it('rejeita atividade fora da avaliação e registros inválidos', async () => {
    const { token, occ } = await setup()
    const s = await start(token); if ('error' in s) throw new Error('x')
    const other = activeOccupations().find((o) => !occ.includes(o.id))!.id
    expect(await portalApi.saveRecords(token, s.sessionId, [rec(other)])).toMatchObject({ error: 'invalid_record' })
    expect(await portalApi.saveRecords(token, s.sessionId, [rec(occ[0], { status: 'not_performed' })])).toMatchObject({ error: 'invalid_record' })
    expect(await portalApi.saveRecords(token, s.sessionId, [rec(occ[0], { discomfort: ['none', 'physical'] })])).toMatchObject({ error: 'invalid_record' })
    expect(await portalApi.saveRecords(token, s.sessionId, [rec(occ[0], { directTotalMinutes: -3 })])).toMatchObject({ error: 'invalid_record' })
    expect(recordsOfSession(getState(), s.sessionId)).toHaveLength(0)
  })
  it('sessão de outra avaliação não é aceita', async () => {
    const a = await setup(); const b = await setup()
    const sb = await start(b.token); if ('error' in sb) throw new Error('x')
    expect(await portalApi.saveRecords(a.token, sb.sessionId, [])).toEqual({ error: 'invalid_session' })
    expect(await portalApi.submit(a.token, sb.sessionId)).toEqual({ error: 'invalid_session' })
  })
  it('avaliação guarda snapshot: renomear/ocultar no catálogo não a altera', async () => {
    const { id, occ } = await setup()
    const before = JSON.stringify(getState().assessments.find((a) => a.id === id)!.catalogSnapshot)
    pro.toggleOccupation(occ[0])
    expect(JSON.stringify(getState().assessments.find((a) => a.id === id)!.catalogSnapshot)).toBe(before)
    pro.toggleOccupation(occ[0])
  })
  it('profissional como respondente identifica a fonte e audita edição após envio', async () => {
    const { id, occ } = await setup()
    const sid = pro.startProSession(id, 'interview')
    expect(pro.saveProRecords(sid, [rec(occ[0])])).toEqual({ saved: 1 })
    pro.submitProSession(sid)
    const sess = getState().sessions.find((s) => s.id === sid)!
    expect(sess).toMatchObject({ respondentType: 'professional', sourceOfInformation: 'interview', status: 'submitted' })
    pro.saveProRecords(sid, [rec(occ[0], { directTotalMinutes: 99, notes: 'SIGILOSO' })])
    expect(getState().audit.some((e) => e.action === 'record.changed_after_submit')).toBe(true)
    expect(JSON.stringify(getState().audit)).not.toContain('SIGILOSO')
  })
  it('estados finalizado/cancelado são respeitados', async () => {
    const { id, token } = await setup()
    pro.setStatus(id, 'cancelled')
    expect(await portalApi.open(token)).toEqual({ error: 'not_available' })
    expect(() => pro.setStatus(id, 'draft')).toThrow(/cancelada/)
    await expect(pro.createLink(id, new Date(Date.now() + 864e5))).rejects.toThrow(/não aceita/)
  })
  it('validações de criação: período, atividades e formato', () => {
    const occ = activeOccupations().slice(0, 1).map((o) => o.id)
    const mk = (p: object) => () => pro.createAssessment({ ...base, patientId: pid, occupationIds: occ, fieldConfig: defaultFieldConfig(), ...p })
    expect(mk({ endDate: '2026-11-01' })).toThrow(/data final/)
    expect(mk({ endDate: '2027-03-01' })).toThrow(/62 dias/)
    expect(mk({ occupationIds: [] })).toThrow(/atividade/)
    expect(mk({ formats: [] })).toThrow(/formato/)
    expect(mk({ startDate: '2026-11-06', endDate: '2026-11-09' })).not.toThrow() // 4 dias, não é semana completa
  })
})
