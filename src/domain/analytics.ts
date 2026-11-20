// Cálculos determinísticos (doc 02 §4, §7, §8). Funções puras, sem I/O.
import { periodDates } from './catalog'
import type {
  ActivityRecord, Assessment, Discomfort, FrequencyUnit, OccupationSnapshot, RecordStatus,
} from './types'

export type TotalBasis = 'direct_total' | 'duration_x_count' | 'not_computable' | 'no_time'
export interface RecordTotal { minutes: number | null; basis: TotalBasis }

/** total = duração × ocorrências; total informado diretamente nunca é multiplicado. */
export function recordTotal(r: Pick<ActivityRecord, 'status' | 'durationMinutes' | 'occurrenceCount' | 'directTotalMinutes'>): RecordTotal {
  if (r.status !== 'performed') return { minutes: null, basis: 'no_time' }
  if (r.directTotalMinutes !== null) return { minutes: r.directTotalMinutes, basis: 'direct_total' }
  if (r.durationMinutes !== null && r.occurrenceCount !== null)
    return { minutes: Math.round(r.durationMinutes * r.occurrenceCount), basis: 'duration_x_count' }
  if (r.durationMinutes !== null) return { minutes: null, basis: 'not_computable' }
  return { minutes: null, basis: 'no_time' }
}

export interface Alert { level: 'warning' | 'info'; code: string; message: string; occupationId?: string; date?: string }

export interface ActivitySummary {
  occupation: OccupationSnapshot
  status: RecordStatus
  totalMinutes: number | null
  recordsCount: number
  datedRecords: number
  daysPerformed: number
  uncomputableRecords: number
  satisfaction: { satisfied: number; dissatisfied: number; unanswered: number }
  discomfort: Record<Discomfort, number>
  frequencies: { value: number; unit: FrequencyUnit }[]
  notes: string[]
}

export interface Analysis {
  period: { start: string; end: string; days: string[] }
  activities: ActivitySummary[]
  byDay: { date: string; minutes: number; recordsWithTime: number }[]
  byArea: { areaCode: string; areaName: string; minutes: number; activitiesWithTime: number }[]
  totalMinutes: number
  statusCounts: Record<RecordStatus, number>
  satisfaction: { enabled: boolean; satisfied: number; dissatisfied: number; valid: number; unanswered: number }
  discomfort: { enabled: boolean; multiple: boolean; counts: Record<Discomfort, number>; validRecords: number; unanswered: number }
  frequencyByUnit: Record<FrequencyUnit, { occupationId: string; name: string; value: number }[]>
  alerts: Alert[]
}

const emptyDisc = (): Record<Discomfort, number> => ({ physical: 0, mental: 0, sensory: 0, none: 0 })

/** ADR-011: estado agregado da atividade a partir dos registros. */
export function activityStatus(statuses: RecordStatus[]): RecordStatus {
  const answered = statuses.filter((s) => s !== 'not_answered')
  if (answered.length === 0) return 'not_answered'
  if (answered.includes('performed')) return 'performed'
  if (answered.every((s) => s === 'not_performed')) return 'not_performed'
  if (answered.includes('not_applicable')) return 'not_applicable'
  if (answered.includes('unknown')) return 'unknown'
  return 'not_performed'
}

export function analyze(a: Pick<Assessment, 'startDate' | 'endDate' | 'catalogSnapshot' | 'fieldSnapshot'>, records: ActivityRecord[]): Analysis {
  const cfg = a.fieldSnapshot.fields
  const days = periodDates(a.startDate, a.endDate)
  const daySet = new Set(days)
  const alerts: Alert[] = []
  const statusCounts: Record<RecordStatus, number> = { performed: 0, not_performed: 0, not_applicable: 0, unknown: 0, not_answered: 0 }
  const byDayMap = new Map<string, { minutes: number; recordsWithTime: number }>(days.map((d) => [d, { minutes: 0, recordsWithTime: 0 }]))
  const freq: Analysis['frequencyByUnit'] = { day: [], week: [], month: [], year: [] }
  const sat = { enabled: cfg.satisfaction.enabled, satisfied: 0, dissatisfied: 0, valid: 0, unanswered: 0 }
  const disc = { enabled: cfg.discomfort.enabled, multiple: a.fieldSnapshot.discomfortMultiple, counts: emptyDisc(), validRecords: 0, unanswered: 0 }

  const activities: ActivitySummary[] = a.catalogSnapshot.map((occ) => {
    const recs = records.filter((r) => r.occupationId === occ.occupationId)
    const dated = recs.filter((r) => r.recordDate !== null)
    const period = recs.filter((r) => r.recordDate === null)
    const s: ActivitySummary = {
      occupation: occ,
      status: cfg.status.enabled ? activityStatus(recs.map((r) => r.status)) : (recs.some((r) => r.status === 'performed') ? 'performed' : 'not_answered'),
      totalMinutes: null, recordsCount: recs.length, datedRecords: dated.length, daysPerformed: 0, uncomputableRecords: 0,
      satisfaction: { satisfied: 0, dissatisfied: 0, unanswered: 0 }, discomfort: emptyDisc(), frequencies: [], notes: [],
    }
    let datedTotal: number | null = null
    for (const r of dated) {
      if (!daySet.has(r.recordDate!)) {
        alerts.push({ level: 'warning', code: 'record_outside_period', message: `Registro de “${occ.name}” com data fora do período (${r.recordDate}). Não foi somado.`, occupationId: occ.occupationId, date: r.recordDate! })
        continue
      }
      const t = recordTotal(r)
      if (r.status === 'performed') s.daysPerformed++
      if (t.basis === 'not_computable') s.uncomputableRecords++
      if (t.minutes !== null) {
        datedTotal = (datedTotal ?? 0) + t.minutes
        const d = byDayMap.get(r.recordDate!)!
        d.minutes += t.minutes; d.recordsWithTime++
      }
    }
    let periodTotal: number | null = null
    for (const r of period) {
      const t = recordTotal(r)
      if (t.basis === 'not_computable') s.uncomputableRecords++
      if (t.minutes !== null) periodTotal = (periodTotal ?? 0) + t.minutes
    }
    // ADR-004: registros diários prevalecem; o registro de período não é somado a eles.
    if (datedTotal !== null) {
      s.totalMinutes = datedTotal
      if (periodTotal !== null) alerts.push({ level: 'info', code: 'period_and_daily', message: `“${occ.name}”: há tempo no registro do período e nos registros diários. O total usa os diários; o valor do período (${periodTotal} min) não foi somado.`, occupationId: occ.occupationId })
    } else s.totalMinutes = periodTotal

    for (const r of recs) {
      statusCounts[r.status]++
      if (r.status === 'performed' && cfg.satisfaction.enabled) {
        if (r.satisfaction) { s.satisfaction[r.satisfaction]++; sat[r.satisfaction]++; sat.valid++ } else { s.satisfaction.unanswered++; sat.unanswered++ }
      }
      if (r.status === 'performed' && cfg.discomfort.enabled) {
        if (r.discomfort.length) { disc.validRecords++; for (const d of r.discomfort) { s.discomfort[d]++; disc.counts[d]++ } } else disc.unanswered++
      }
      if (cfg.frequency.enabled && r.frequencyValue !== null && r.frequencyUnit) {
        s.frequencies.push({ value: r.frequencyValue, unit: r.frequencyUnit })
        freq[r.frequencyUnit].push({ occupationId: occ.occupationId, name: occ.name, value: r.frequencyValue })
      }
      if (r.notes.trim()) s.notes.push(r.notes.trim())
    }
    if (recs.length === 0 && cfg.status.enabled) statusCounts.not_answered++
    if (s.uncomputableRecords) alerts.push({ level: 'info', code: 'duration_without_count', message: `“${occ.name}”: ${s.uncomputableRecords} registro(s) com duração sem quantidade de vezes — total não calculado.`, occupationId: occ.occupationId })
    return s
  })

  const byDay = days.map((d) => ({ date: d, ...byDayMap.get(d)! }))
  for (const d of byDay) if (d.minutes > 1440) alerts.push({ level: 'warning', code: 'day_over_1440', message: `O dia ${d.date} soma ${d.minutes} minutos, mais que as 24 horas de um dia (1.440 min). As respostas não foram alteradas.`, date: d.date })

  const areaMap = new Map<string, { areaCode: string; areaName: string; minutes: number; activitiesWithTime: number }>()
  for (const s of activities) {
    if (s.totalMinutes === null) continue
    const k = s.occupation.areaCode
    const cur = areaMap.get(k) ?? { areaCode: k, areaName: s.occupation.areaName, minutes: 0, activitiesWithTime: 0 }
    cur.minutes += s.totalMinutes; cur.activitiesWithTime++
    areaMap.set(k, cur)
  }
  const totalMinutes = activities.reduce((acc, s) => acc + (s.totalMinutes ?? 0), 0)
  return {
    period: { start: a.startDate, end: a.endDate, days },
    activities, byDay, byArea: [...areaMap.values()], totalMinutes, statusCounts,
    satisfaction: sat, discomfort: disc, frequencyByUnit: freq, alerts,
  }
}

export function pct(n: number, d: number): string {
  if (d === 0) return '—'
  return `${Math.round((n / d) * 1000) / 10}%`.replace('.', ',')
}
