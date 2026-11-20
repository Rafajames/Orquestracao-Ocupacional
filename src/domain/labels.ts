import type {
  AssessmentStatus, Discomfort, FieldKey, FillFormat, FrequencyUnit, GuardianMode, RecordStatus,
  RespondentType, Satisfaction, SourceOfInformation, TargetType,
} from './types'

export const STATUS_LABEL: Record<RecordStatus, string> = {
  performed: 'Realiza',
  not_performed: 'Não realiza no período',
  not_applicable: 'Não se aplica',
  unknown: 'Não sabe informar',
  not_answered: 'Sem resposta',
}
export const FREQ_LABEL: Record<FrequencyUnit, string> = {
  day: 'por dia', week: 'por semana', month: 'por mês', year: 'por ano',
}
export const SATISFACTION_LABEL: Record<Satisfaction, string> = {
  satisfied: 'Satisfeito(a)', dissatisfied: 'Insatisfeito(a)',
}
export const DISCOMFORT_LABEL: Record<Discomfort, string> = {
  physical: 'Físico', mental: 'Mental', sensory: 'Sensorial', none: 'Sem desconforto',
}
export const FORMAT_LABEL: Record<FillFormat, string> = {
  by_activity: 'Por atividade', weekly_routine: 'Rotina por dia',
}
export const TARGET_LABEL: Record<TargetType | 'unspecified', string> = {
  adult: 'Adulto', child: 'Criança', unspecified: 'Não especificado',
}
export const RESPONDENT_LABEL: Record<RespondentType, string> = {
  patient: 'Paciente', guardian: 'Responsável', professional: 'Profissional',
  joint: 'Paciente e responsável juntos',
}
export const SOURCE_LABEL: Record<SourceOfInformation, string> = {
  self_report: 'Relato do próprio paciente',
  guardian_report: 'Relato do responsável',
  professional_observation: 'Observação profissional',
  interview: 'Entrevista',
  mixed: 'Fontes combinadas',
}
export const GUARDIAN_MODE_LABEL: Record<GuardianMode, string> = {
  guardian_alone: 'O responsável respondeu sozinho',
  guardian_with_child: 'O responsável respondeu junto com a criança',
  child_with_help: 'A criança respondeu com auxílio do responsável',
}
export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  draft: 'Rascunho', sent: 'Link enviado', in_progress: 'Em preenchimento', submitted: 'Enviada',
  under_review: 'Em revisão', finalized: 'Finalizada', expired: 'Expirada', cancelled: 'Cancelada',
}
export const FIELD_LABEL: Record<FieldKey, string> = {
  status: 'Realiza a atividade?',
  duration: 'Duração por vez',
  occurrences: 'Quantidade de vezes (no registro)',
  direct_total: 'Tempo total',
  frequency: 'Frequência habitual',
  satisfaction: 'Satisfação',
  discomfort: 'Desconforto',
  notes: 'Observação',
  start_end_time: 'Horário de início e fim',
}

export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export function weekdayName(iso: string): string {
  return WEEKDAY[new Date(iso + 'T12:00:00').getDay()]
}
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
