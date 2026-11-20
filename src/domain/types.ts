// Tipos de domínio — espelham docs/original/docs/02 e db/migrations.
export type RecordStatus = 'performed' | 'not_performed' | 'not_applicable' | 'unknown' | 'not_answered'
export type FrequencyUnit = 'day' | 'week' | 'month' | 'year'
export type Satisfaction = 'satisfied' | 'dissatisfied'
export type Discomfort = 'physical' | 'mental' | 'sensory' | 'none'
export type FillFormat = 'by_activity' | 'weekly_routine'
export type TargetType = 'adult' | 'child'
export type RespondentType = 'patient' | 'guardian' | 'professional' | 'joint'
export type SourceOfInformation = 'self_report' | 'guardian_report' | 'professional_observation' | 'interview' | 'mixed'
export type GuardianMode = 'guardian_alone' | 'guardian_with_child' | 'child_with_help'
export type EntryMode = 'by_activity' | 'weekly_routine' | 'professional_interview'
export type AssessmentStatus =
  | 'draft' | 'sent' | 'in_progress' | 'submitted' | 'under_review' | 'finalized' | 'expired' | 'cancelled'

export type FieldKey =
  | 'status' | 'duration' | 'occurrences' | 'direct_total' | 'frequency'
  | 'satisfaction' | 'discomfort' | 'notes' | 'start_end_time'

export interface FieldRule { enabled: boolean; required: boolean }
export interface FieldConfig {
  fields: Record<FieldKey, FieldRule>
  /** ADR-003: ampliação proposta, desligada por padrão. */
  discomfortMultiple: boolean
  /** Limite máximo (minutos) aceito em um único campo de tempo. */
  maxMinutesPerField: number
}

export interface Area { code: string; name: string; parentCode: string | null; sortOrder: number }

export interface Occupation {
  id: string
  stableKey: string
  name: string
  description?: string
  areaCode: string
  subareaCode: string | null
  origin: 'source_catalog' | 'custom'
  sourceNumber: number | null
  sourceRow: number | null
  sourceSheet: string | null
  ownerOrganizationId: string | null
  isActive: boolean
}

/** Snapshot congelado na avaliação: mudanças no catálogo não alteram avaliações históricas. */
export interface OccupationSnapshot {
  occupationId: string
  stableKey: string
  name: string
  areaCode: string
  areaName: string
  subareaCode: string | null
  subareaName: string | null
  origin: Occupation['origin']
  sourceNumber: number | null
}

export interface Patient {
  id: string
  organizationId: string
  displayName: string
  birthDate: string | null
  patientType: TargetType | 'unspecified'
  createdAt: string
}

export interface Assessment {
  id: string
  organizationId: string
  patientId: string
  createdBy: string
  title: string
  targetType: TargetType
  fillFormats: FillFormat[]
  startDate: string // YYYY-MM-DD
  endDate: string
  expectedRespondent: RespondentType
  expectedSource: SourceOfInformation
  instructions: string
  status: AssessmentStatus
  catalogSnapshot: OccupationSnapshot[]
  fieldSnapshot: FieldConfig
  methodologyVersion: string
  submittedAt: string | null
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AssessmentLink {
  id: string
  assessmentId: string
  tokenHash: string
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  createdBy: string
  lastUsedAt: string | null
}

export interface ResponseSession {
  id: string
  assessmentId: string
  respondentType: RespondentType
  respondentName: string | null
  relationshipToPatient: string | null
  guardianMode: GuardianMode | null
  sourceOfInformation: SourceOfInformation
  respondentNotes: string
  status: 'in_progress' | 'submitted'
  startedAt: string
  submittedAt: string | null
  privacyAcceptedAt: string | null
}

export interface ActivityRecord {
  id: string
  assessmentId: string
  sessionId: string
  occupationId: string
  /** null = registro do período inteiro (formato por atividade). */
  recordDate: string | null
  status: RecordStatus
  durationMinutes: number | null
  occurrenceCount: number | null
  directTotalMinutes: number | null
  frequencyValue: number | null
  frequencyUnit: FrequencyUnit | null
  satisfaction: Satisfaction | null
  discomfort: Discomfort[]
  startTime: string | null
  endTime: string | null
  notes: string
  entryMode: EntryMode
  updatedAt: string
}

export interface AssessmentNote {
  id: string
  assessmentId: string
  authorId: string
  noteType: 'professional_analysis' | 'report_text'
  body: string
  updatedAt: string
}

export interface AuditEvent {
  id: string
  organizationId: string
  actorId: string | null
  entityType: string
  entityId: string | null
  action: string
  metadata: Record<string, unknown>
  createdAt: string
}
