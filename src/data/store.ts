// Armazenamento do MODO LOCAL (ADR-013): dados no navegador, apenas para demonstração/homologação com dados fictícios.
// O contrato do portal (portalApi) espelha as funções SQL de db/migrations/002_security.sql.
import { useSyncExternalStore } from 'react'
import {
  METHODOLOGY_VERSION, buildAreas, buildSourceCatalog, defaultFieldConfig, periodDates, snapshotOccupation,
} from '../domain/catalog'
import { sha256Hex, generateToken, uid } from '../domain/token'
import type {
  ActivityRecord, Assessment, AssessmentLink, AssessmentNote, AssessmentStatus, AuditEvent, FieldConfig, FillFormat,
  Occupation, Patient, RespondentType, ResponseSession, SourceOfInformation, TargetType, GuardianMode,
} from '../domain/types'
import { hasErrors, validateRecord } from '../domain/validation'

export const AREAS = buildAreas()
const SOURCE = buildSourceCatalog()

export interface ModelTemplate {
  id: string; name: string; targetType: TargetType; formats: FillFormat[]; fieldConfig: FieldConfig; occupationIds: string[]; createdAt: string
}
interface State {
  version: 1
  profile: { id: string; displayName: string } | null
  orgId: string
  patients: Patient[]
  customOccupations: Occupation[]
  hiddenOccupationIds: string[]
  templates: ModelTemplate[]
  assessments: Assessment[]
  links: AssessmentLink[]
  sessions: ResponseSession[]
  records: ActivityRecord[]
  notes: AssessmentNote[]
  audit: AuditEvent[]
  failedAccesses: number
}

const KEY = 'oo:v1'
function fresh(): State {
  return { version: 1, profile: null, orgId: uid(), patients: [], customOccupations: [], hiddenOccupationIds: [], templates: [], assessments: [], links: [], sessions: [], records: [], notes: [], audit: [], failedAccesses: 0 }
}
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw); if (s?.version === 1) return s }
  } catch { /* armazenamento indisponível ou corrompido */ }
  return fresh()
}
let state: State = load()
const listeners = new Set<() => void>()
let persistError = false
function commit(next: State) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)); persistError = false } catch { persistError = true }
  listeners.forEach((l) => l())
}
const now = () => new Date().toISOString()
export function useStore(): State { return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state) }
export function getState(): State { return state }
export function storageFailed(): boolean { return persistError }

function withAudit(s: State, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}): State {
  const ev: AuditEvent = { id: uid(), organizationId: s.orgId, actorId: s.profile?.id ?? null, entityType, entityId, action, metadata, createdAt: now() }
  return { ...s, audit: [ev, ...s.audit].slice(0, 2000) }
}

// ───────────── Catálogo ─────────────
export function allOccupations(s: State = state): Occupation[] { return [...SOURCE, ...s.customOccupations] }
export function activeOccupations(s: State = state): Occupation[] { return allOccupations(s).filter((o) => o.isActive && !s.hiddenOccupationIds.includes(o.id)) }

// ───────────── Profissional ─────────────
export const pro = {
  login(displayName: string) {
    const name = displayName.trim()
    if (!name) throw new Error('Informe seu nome.')
    commit({ ...state, profile: { id: state.profile?.id ?? uid(), displayName: name } })
  },
  logout() { commit({ ...state, profile: null }) },
  resetAllData() { commit({ ...fresh(), profile: state.profile }) },
  exportData(): string { return JSON.stringify(state, null, 2) },

  addPatient(input: { displayName: string; birthDate: string | null; patientType: Patient['patientType'] }): string {
    if (!input.displayName.trim()) throw new Error('Informe o nome do paciente.')
    const p: Patient = { id: uid(), organizationId: state.orgId, displayName: input.displayName.trim(), birthDate: input.birthDate || null, patientType: input.patientType, createdAt: now() }
    commit(withAudit({ ...state, patients: [p, ...state.patients] }, 'patient.created', 'patients', p.id))
    return p.id
  },
  addCustomOccupation(input: { name: string; areaCode: string; subareaCode: string | null; description?: string }): string {
    const name = input.name.trim()
    if (!name) throw new Error('Informe o nome da atividade.')
    if (allOccupations().some((o) => o.name.toLowerCase() === name.toLowerCase() && o.areaCode === input.areaCode))
      throw new Error('Já existe uma atividade com esse nome nesta área.')
    const o: Occupation = { id: uid(), stableKey: `custom-${uid()}`, name, description: input.description?.trim() || undefined, areaCode: input.areaCode, subareaCode: input.subareaCode, origin: 'custom', sourceNumber: null, sourceRow: null, sourceSheet: null, ownerOrganizationId: state.orgId, isActive: true }
    commit(withAudit({ ...state, customOccupations: [...state.customOccupations, o] }, 'catalog.custom_insert', 'occupations', o.id))
    return o.id
  },
  /** Ativar/desativar para novas avaliações. Não altera o catálogo original nem avaliações já criadas. */
  toggleOccupation(id: string) {
    const hidden = state.hiddenOccupationIds.includes(id) ? state.hiddenOccupationIds.filter((x) => x !== id) : [...state.hiddenOccupationIds, id]
    commit(withAudit({ ...state, hiddenOccupationIds: hidden }, 'catalog.visibility_changed', 'occupations', null, { occupationKey: id }))
  },
  saveTemplate(t: Omit<ModelTemplate, 'id' | 'createdAt'>) {
    const m: ModelTemplate = { ...t, id: uid(), createdAt: now() }
    commit(withAudit({ ...state, templates: [m, ...state.templates] }, 'template.insert', 'assessment_templates', m.id))
  },
  deleteTemplate(id: string) { commit(withAudit({ ...state, templates: state.templates.filter((t) => t.id !== id) }, 'template.delete', 'assessment_templates', id)) },

  createAssessment(input: {
    patientId: string; title: string; targetType: TargetType; formats: FillFormat[]; startDate: string; endDate: string
    expectedRespondent: RespondentType; expectedSource: SourceOfInformation; instructions: string; occupationIds: string[]; fieldConfig: FieldConfig
  }): string {
    if (!state.patients.some((p) => p.id === input.patientId)) throw new Error('Selecione um paciente.')
    if (!input.title.trim()) throw new Error('Dê um título à avaliação.')
    if (!input.formats.length) throw new Error('Escolha ao menos um formato de preenchimento.')
    if (!input.startDate || !input.endDate || input.endDate < input.startDate) throw new Error('A data final deve ser igual ou posterior à data inicial.')
    if (periodDates(input.startDate, input.endDate, 63).length > 62) throw new Error('O período pode ter no máximo 62 dias.')
    const occ = allOccupations().filter((o) => input.occupationIds.includes(o.id))
    if (!occ.length) throw new Error('Selecione ao menos uma atividade.')
    const t = new Date().toISOString()
    const a: Assessment = {
      id: uid(), organizationId: state.orgId, patientId: input.patientId, createdBy: state.profile?.id ?? '', title: input.title.trim(),
      targetType: input.targetType, fillFormats: input.formats, startDate: input.startDate, endDate: input.endDate,
      expectedRespondent: input.expectedRespondent, expectedSource: input.expectedSource, instructions: input.instructions.trim(),
      status: 'draft', catalogSnapshot: occ.map((o) => snapshotOccupation(o, AREAS)), fieldSnapshot: structuredClone(input.fieldConfig),
      methodologyVersion: METHODOLOGY_VERSION, submittedAt: null, finalizedAt: null, createdAt: t, updatedAt: t,
    }
    commit(withAudit({ ...state, assessments: [a, ...state.assessments] }, 'assessment.created', 'assessments', a.id))
    return a.id
  },
  setStatus(id: string, to: AssessmentStatus) {
    const a = state.assessments.find((x) => x.id === id)
    if (!a) throw new Error('Avaliação não encontrada.')
    if (a.status === 'cancelled') throw new Error('Avaliação cancelada não pode ser reaberta.')
    const t = now()
    const next: Assessment = { ...a, status: to, updatedAt: t, finalizedAt: to === 'finalized' ? t : a.finalizedAt }
    const action = a.status === 'finalized' && to !== 'finalized' ? 'assessment.reopened' : 'assessment.status_changed'
    commit(withAudit({ ...state, assessments: state.assessments.map((x) => (x.id === id ? next : x)) }, action, 'assessments', id, { from: a.status, to }))
  },
  /** Cria link com validade obrigatória (máx. 1 ano). Devolve o token UMA vez; só o hash fica guardado. */
  async createLink(assessmentId: string, expiresAt: Date): Promise<string> {
    const a = state.assessments.find((x) => x.id === assessmentId)
    if (!a) throw new Error('Avaliação não encontrada.')
    if (a.status === 'cancelled' || a.status === 'finalized') throw new Error('Esta avaliação não aceita novos links.')
    if (expiresAt <= new Date()) throw new Error('Escolha uma validade no futuro.')
    if (expiresAt.getTime() > Date.now() + 366 * 864e5) throw new Error('A validade máxima do link é de 1 ano.')
    const token = generateToken()
    const link: AssessmentLink = { id: uid(), assessmentId, tokenHash: await sha256Hex(token), expiresAt: expiresAt.toISOString(), revokedAt: null, createdAt: now(), createdBy: state.profile?.id ?? '', lastUsedAt: null }
    let s: State = { ...state, links: [link, ...state.links] }
    if (a.status === 'draft') s = { ...s, assessments: s.assessments.map((x) => (x.id === assessmentId ? { ...x, status: 'sent' as const, updatedAt: now() } : x)) }
    commit(withAudit(withAudit(s, 'link.created', 'assessment_links', link.id, { expires_at: link.expiresAt }), 'assessment.status_changed', 'assessments', assessmentId, { from: a.status, to: s.assessments.find((x) => x.id === assessmentId)!.status }))
    return token
  },
  revokeLink(linkId: string) {
    commit(withAudit({ ...state, links: state.links.map((l) => (l.id === linkId ? { ...l, revokedAt: l.revokedAt ?? now() } : l)) }, 'link.revoked', 'assessment_links', linkId))
  },
  /** Profissional como respondente (entrevista/observação). */
  startProSession(assessmentId: string, source: SourceOfInformation): string {
    const a = state.assessments.find((x) => x.id === assessmentId)
    if (!a || a.status === 'cancelled' || a.status === 'finalized') throw new Error('Esta avaliação não aceita novas respostas.')
    const existing = state.sessions.find((x) => x.assessmentId === assessmentId && x.respondentType === 'professional' && x.status === 'in_progress')
    if (existing) return existing.id
    const sess: ResponseSession = { id: uid(), assessmentId, respondentType: 'professional', respondentName: state.profile?.displayName ?? null, relationshipToPatient: 'Terapeuta ocupacional', guardianMode: null, sourceOfInformation: source, respondentNotes: '', status: 'in_progress', startedAt: now(), submittedAt: null, privacyAcceptedAt: null }
    commit(withAudit({ ...state, sessions: [...state.sessions, sess] }, 'response.started', 'response_sessions', sess.id, { respondent_type: 'professional' }))
    return sess.id
  },
  saveProRecords(sessionId: string, records: RecordInput[], notes?: string): { saved: number } | { error: string } {
    const sess = state.sessions.find((x) => x.id === sessionId)
    if (!sess) return { error: 'invalid_session' }
    const a = state.assessments.find((x) => x.id === sess.assessmentId)!
    if (a.status === 'cancelled' || a.status === 'finalized') return { error: 'not_available' }
    const r = applyRecords(state, a, sess, records, notes, 'professional_interview')
    if ('error' in r) return r
    let s = r.state
    if (['submitted', 'under_review', 'finalized'].includes(a.status)) s = withAudit(s, 'record.changed_after_submit', 'activity_records', null, { op: 'UPDATE', assessment_status: a.status })
    commit(s)
    return { saved: records.length }
  },
  submitProSession(sessionId: string) {
    const sess = state.sessions.find((x) => x.id === sessionId)
    if (!sess) throw new Error('Sessão não encontrada.')
    commit(markSubmitted(state, sess))
  },
  saveNote(assessmentId: string, noteType: AssessmentNote['noteType'], body: string) {
    const ex = state.notes.find((n) => n.assessmentId === assessmentId && n.noteType === noteType)
    const n: AssessmentNote = ex ? { ...ex, body, updatedAt: now() } : { id: uid(), assessmentId, authorId: state.profile?.id ?? '', noteType, body, updatedAt: now() }
    commit(withAudit({ ...state, notes: ex ? state.notes.map((x) => (x.id === ex.id ? n : x)) : [...state.notes, n] }, ex ? 'note.update' : 'note.insert', 'assessment_notes', n.id))
  },
  logReport(assessmentId: string) { commit(withAudit(state, 'report.created', 'assessment_reports', null, { assessment_id: assessmentId, report_type: 'complete' })) },
}

// ───────────── Registros (lógica comum ao profissional e ao portal) ─────────────
export type RecordInput = Omit<ActivityRecord, 'id' | 'assessmentId' | 'sessionId' | 'updatedAt' | 'entryMode'> & { entryMode?: ActivityRecord['entryMode'] }

function applyRecords(s: State, a: Assessment, sess: ResponseSession, records: RecordInput[], notes: string | undefined, defaultMode: ActivityRecord['entryMode']): { state: State } | { error: string; details?: string } {
  const known = new Set(a.catalogSnapshot.map((o) => o.occupationId))
  const t = now()
  let list = s.records
  for (const r of records) {
    if (!known.has(r.occupationId)) return { error: 'invalid_record', details: 'Atividade não faz parte desta avaliação.' }
    const issues = validateRecord(r, a.fieldSnapshot)
    if (hasErrors(issues)) return { error: 'invalid_record', details: issues.find((i) => i.level === 'error')!.message }
    const idx = list.findIndex((x) => x.sessionId === sess.id && x.occupationId === r.occupationId && x.recordDate === r.recordDate)
    const rec: ActivityRecord = { ...r, entryMode: r.entryMode ?? defaultMode, id: idx >= 0 ? list[idx].id : uid(), assessmentId: a.id, sessionId: sess.id, updatedAt: t }
    list = idx >= 0 ? list.map((x, i) => (i === idx ? rec : x)) : [...list, rec]
  }
  const sessions = notes === undefined ? s.sessions : s.sessions.map((x) => (x.id === sess.id ? { ...x, respondentNotes: notes.slice(0, 4000) } : x))
  const assessments = a.status === 'sent' ? s.assessments.map((x) => (x.id === a.id ? { ...x, status: 'in_progress' as const, updatedAt: t } : x)) : s.assessments
  return { state: { ...s, records: list, sessions, assessments } }
}
function markSubmitted(s: State, sess: ResponseSession): State {
  const t = now()
  let n: State = { ...s, sessions: s.sessions.map((x) => (x.id === sess.id ? { ...x, status: 'submitted' as const, submittedAt: t } : x)), assessments: s.assessments.map((x) => (x.id === sess.assessmentId ? { ...x, status: 'submitted' as const, submittedAt: t, updatedAt: t } : x)) }
  n = withAudit(n, 'response.submitted', 'response_sessions', sess.id)
  return withAudit(n, 'assessment.status_changed', 'assessments', sess.assessmentId, { to: 'submitted' })
}

// ───────────── Portal por link (contrato = funções portal_* do SQL) ─────────────
export type PortalError = 'invalid_link' | 'revoked_link' | 'expired_link' | 'not_available' | 'privacy_required' | 'invalid_session' | 'invalid_record'
export interface PortalAssessment {
  title: string; targetType: TargetType; fillFormats: FillFormat[]; startDate: string; endDate: string; instructions: string
  expectedRespondent: RespondentType; expectedSource: SourceOfInformation; catalogSnapshot: Assessment['catalogSnapshot']; fieldSnapshot: FieldConfig
}
export type PortalOpen =
  | { error: PortalError }
  | { submitted: true; title: string }
  | { assessment: PortalAssessment; session: ResponseSession | null; records: ActivityRecord[] }

async function resolve(token: string): Promise<{ link: AssessmentLink; a: Assessment } | { error: PortalError }> {
  if (!token || token.length < 32 || token.length > 200) { commit({ ...state, failedAccesses: state.failedAccesses + 1 }); return { error: 'invalid_link' } }
  const h = await sha256Hex(token)
  const link = state.links.find((l) => l.tokenHash === h)
  if (!link) { commit({ ...state, failedAccesses: state.failedAccesses + 1 }); return { error: 'invalid_link' } }
  if (link.revokedAt) return { error: 'revoked_link' }
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return { error: 'expired_link' }
  const a = state.assessments.find((x) => x.id === link.assessmentId)!
  if (a.status === 'cancelled' || a.status === 'expired') return { error: 'not_available' }
  commit({ ...state, links: state.links.map((l) => (l.id === link.id ? { ...l, lastUsedAt: now() } : l)) })
  return { link, a }
}

export const portalApi = {
  async open(token: string): Promise<PortalOpen> {
    const r = await resolve(token)
    if ('error' in r) return r
    const a = state.assessments.find((x) => x.id === r.a.id)!
    if (a.status === 'draft') return { error: 'not_available' }
    if (['submitted', 'under_review', 'finalized'].includes(a.status)) return { submitted: true, title: a.title }
    const session = [...state.sessions].reverse().find((x) => x.assessmentId === a.id && x.status === 'in_progress') ?? null
    // Não expõe nome nem dados do paciente.
    return {
      assessment: { title: a.title, targetType: a.targetType, fillFormats: a.fillFormats, startDate: a.startDate, endDate: a.endDate, instructions: a.instructions, expectedRespondent: a.expectedRespondent, expectedSource: a.expectedSource, catalogSnapshot: a.catalogSnapshot, fieldSnapshot: a.fieldSnapshot },
      session, records: session ? state.records.filter((x) => x.sessionId === session.id) : [],
    }
  },
  async startSession(token: string, i: { respondentType: RespondentType; name: string; relationship: string; guardianMode: GuardianMode | null; source: SourceOfInformation; privacyAccepted: boolean }): Promise<{ sessionId: string } | { error: PortalError }> {
    const r = await resolve(token)
    if ('error' in r) return r
    if (!i.privacyAccepted) return { error: 'privacy_required' }
    const a = state.assessments.find((x) => x.id === r.a.id)!
    if (a.status !== 'sent' && a.status !== 'in_progress') return { error: 'not_available' }
    const gm = i.respondentType === 'guardian' || i.respondentType === 'joint' ? i.guardianMode : null
    const ex = [...state.sessions].reverse().find((x) => x.assessmentId === a.id && x.status === 'in_progress')
    if (ex) {
      commit({ ...state, sessions: state.sessions.map((x) => (x.id === ex.id ? { ...x, respondentType: i.respondentType, respondentName: i.name.slice(0, 200), relationshipToPatient: i.relationship.slice(0, 200), guardianMode: gm, sourceOfInformation: i.source } : x)) })
      return { sessionId: ex.id }
    }
    const sess: ResponseSession = { id: uid(), assessmentId: a.id, respondentType: i.respondentType, respondentName: i.name.slice(0, 200), relationshipToPatient: i.relationship.slice(0, 200), guardianMode: gm, sourceOfInformation: i.source, respondentNotes: '', status: 'in_progress', startedAt: now(), submittedAt: null, privacyAcceptedAt: now() }
    let s: State = { ...state, sessions: [...state.sessions, sess] }
    s = withAudit(s, 'response.started', 'response_sessions', sess.id, { respondent_type: i.respondentType })
    if (a.status === 'sent') s = { ...s, assessments: s.assessments.map((x) => (x.id === a.id ? { ...x, status: 'in_progress' as const, updatedAt: now() } : x)) }
    commit(s)
    return { sessionId: sess.id }
  },
  async saveRecords(token: string, sessionId: string, records: RecordInput[], notes?: string): Promise<{ saved: number } | { error: PortalError; details?: string }> {
    const r = await resolve(token)
    if ('error' in r) return r
    const a = state.assessments.find((x) => x.id === r.a.id)!
    if (a.status !== 'sent' && a.status !== 'in_progress') return { error: 'not_available' }
    const sess = state.sessions.find((x) => x.id === sessionId && x.assessmentId === a.id && x.status === 'in_progress')
    if (!sess) return { error: 'invalid_session' }
    const res = applyRecords(state, a, sess, records, notes, 'by_activity')
    if ('error' in res) return { error: 'invalid_record', details: res.details }
    commit(res.state)
    return { saved: records.length }
  },
  async submit(token: string, sessionId: string): Promise<{ submitted: true } | { error: PortalError }> {
    const r = await resolve(token)
    if ('error' in r) return r
    const a = state.assessments.find((x) => x.id === r.a.id)!
    if (a.status !== 'sent' && a.status !== 'in_progress') return { error: 'not_available' }
    const sess = state.sessions.find((x) => x.id === sessionId && x.assessmentId === a.id && x.status === 'in_progress')
    if (!sess) return { error: 'invalid_session' }
    commit(markSubmitted(state, sess))
    return { submitted: true }
  },
}

// ───────────── Consultas ─────────────
export function linkIsActive(l: AssessmentLink): boolean {
  return !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date())
}
/** Sessão de referência para análises (ADR-019): a mais recente enviada; senão a mais recente em andamento. */
export function referenceSession(s: State, assessmentId: string): ResponseSession | null {
  const list = s.sessions.filter((x) => x.assessmentId === assessmentId)
  const sub = list.filter((x) => x.status === 'submitted').sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
  return sub[0] ?? [...list].reverse()[0] ?? null
}
export function recordsOfSession(s: State, sessionId: string | null): ActivityRecord[] {
  return sessionId ? s.records.filter((r) => r.sessionId === sessionId) : []
}
export { defaultFieldConfig }
