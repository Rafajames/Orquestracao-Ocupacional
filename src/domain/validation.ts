import { z } from 'zod'
import type { ActivityRecord, FieldConfig } from './types'

export interface Issue { level: 'error' | 'warning'; code: string; message: string }

const minutes = z.number().int('Use minutos inteiros.').min(0, 'O valor não pode ser negativo.').nullable()

export const recordSchema = z.object({
  status: z.enum(['performed', 'not_performed', 'not_applicable', 'unknown', 'not_answered']),
  durationMinutes: minutes,
  occurrenceCount: z.number().min(0, 'A quantidade não pode ser negativa.').nullable(),
  directTotalMinutes: minutes,
  frequencyValue: z.number().min(0, 'A frequência não pode ser negativa.').nullable(),
  frequencyUnit: z.enum(['day', 'week', 'month', 'year']).nullable(),
  satisfaction: z.enum(['satisfied', 'dissatisfied']).nullable(),
  discomfort: z.array(z.enum(['physical', 'mental', 'sensory', 'none'])),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  notes: z.string().max(2000, 'Observação muito longa (máx. 2000 caracteres).'),
})

type RecordInput = Pick<ActivityRecord,
  'status' | 'durationMinutes' | 'occurrenceCount' | 'directTotalMinutes' | 'frequencyValue' | 'frequencyUnit' |
  'satisfaction' | 'discomfort' | 'startTime' | 'endTime' | 'notes'>

/** Regras do doc 02 §8. Erros bloqueiam o salvamento; avisos não alteram a resposta. */
export function validateRecord(r: RecordInput, cfg?: FieldConfig): Issue[] {
  const issues: Issue[] = []
  const parsed = recordSchema.safeParse(r)
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ level: 'error', code: 'schema.' + i.path.join('.'), message: i.message })
  }
  const hasTime = (r.durationMinutes ?? 0) > 0 || (r.directTotalMinutes ?? 0) > 0
  if (r.status === 'not_performed' && hasTime)
    issues.push({ level: 'error', code: 'not_performed_with_time', message: '“Não realiza” não pode ter tempo registrado.' })
  if (r.status === 'not_applicable' && hasTime)
    issues.push({ level: 'error', code: 'not_applicable_with_time', message: '“Não se aplica” não pode ter tempo registrado.' })
  if (r.discomfort.includes('none') && r.discomfort.length > 1)
    issues.push({ level: 'error', code: 'none_with_discomfort', message: '“Sem desconforto” não pode ser marcado junto com outro tipo.' })
  if (cfg && !cfg.discomfortMultiple && r.discomfort.filter((d) => d !== 'none').length > 1)
    issues.push({ level: 'error', code: 'multiple_discomfort_disabled', message: 'Esta avaliação aceita apenas um tipo de desconforto.' })
  if (r.frequencyValue !== null && r.frequencyUnit === null)
    issues.push({ level: 'error', code: 'frequency_without_unit', message: 'Informe a unidade da frequência (por dia, semana, mês ou ano).' })
  if (r.frequencyUnit !== null && r.frequencyValue === null)
    issues.push({ level: 'error', code: 'unit_without_frequency', message: 'Informe quantas vezes.' })
  const max = cfg?.maxMinutesPerField ?? 1440
  for (const [k, v] of [['durationMinutes', r.durationMinutes], ['directTotalMinutes', r.directTotalMinutes]] as const)
    if (v !== null && v > max) issues.push({ level: 'error', code: `${k}_above_max`, message: `O tempo informado passa do limite de ${max} minutos.` })
  if (r.startTime && r.endTime && r.endTime <= r.startTime)
    issues.push({ level: 'warning', code: 'end_before_start', message: 'O horário de fim é anterior ou igual ao de início.' })
  if (r.durationMinutes !== null && r.occurrenceCount === null && r.directTotalMinutes === null && r.status === 'performed')
    issues.push({ level: 'warning', code: 'duration_without_count', message: 'Duração sem quantidade de vezes: o total não será calculado.' })
  return issues
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

/** Verifica campos obrigatórios habilitados. Campos desabilitados nunca são cobrados (doc 02 §2). */
export function missingRequired(r: RecordInput, cfg: FieldConfig): string[] {
  if (r.status !== 'performed') return cfg.fields.status.enabled && cfg.fields.status.required && r.status === 'not_answered' ? ['status'] : []
  const out: string[] = []
  const f = cfg.fields
  if (f.duration.enabled && f.duration.required && r.durationMinutes === null) out.push('duration')
  if (f.occurrences.enabled && f.occurrences.required && r.occurrenceCount === null) out.push('occurrences')
  if (f.direct_total.enabled && f.direct_total.required && r.directTotalMinutes === null) out.push('direct_total')
  if (f.frequency.enabled && f.frequency.required && r.frequencyValue === null) out.push('frequency')
  if (f.satisfaction.enabled && f.satisfaction.required && r.satisfaction === null) out.push('satisfaction')
  if (f.discomfort.enabled && f.discomfort.required && r.discomfort.length === 0) out.push('discomfort')
  return out
}
