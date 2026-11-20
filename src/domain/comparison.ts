// Comparação entre avaliações do mesmo paciente (doc 01 §9, doc 02 §9).
import { analyze, type ActivitySummary } from './analytics'
import { FIELD_LABEL } from './labels'
import type { ActivityRecord, Assessment, FieldKey } from './types'

export interface CommonItem {
  key: string
  a: ActivitySummary
  b: ActivitySummary
  labelChanged: boolean
  areaChanged: boolean
  /** Diferença só é mostrada se ambos os totais existirem; ausência nunca vira zero. */
  deltaMinutes: number | null
}

export interface Comparison {
  common: CommonItem[]
  onlyA: ActivitySummary[]
  onlyB: ActivitySummary[]
  notes: string[]
  periodDaysA: number
  periodDaysB: number
}

/** Correspondência pela chave estável do catálogo (não pelo rótulo). */
export function compareAssessments(
  A: Assessment, recsA: ActivityRecord[], B: Assessment, recsB: ActivityRecord[],
): Comparison {
  const anA = analyze(A, recsA)
  const anB = analyze(B, recsB)
  const mapB = new Map(anB.activities.map((s) => [s.occupation.stableKey, s]))
  const common: CommonItem[] = []
  const onlyA: ActivitySummary[] = []
  for (const s of anA.activities) {
    const o = mapB.get(s.occupation.stableKey)
    if (!o) { onlyA.push(s); continue }
    common.push({
      key: s.occupation.stableKey, a: s, b: o,
      labelChanged: s.occupation.name !== o.occupation.name,
      areaChanged: s.occupation.areaCode !== o.occupation.areaCode || s.occupation.subareaCode !== o.occupation.subareaCode,
      deltaMinutes: s.totalMinutes !== null && o.totalMinutes !== null ? o.totalMinutes - s.totalMinutes : null,
    })
  }
  const keysA = new Set(anA.activities.map((s) => s.occupation.stableKey))
  const onlyB = anB.activities.filter((s) => !keysA.has(s.occupation.stableKey))

  const notes: string[] = []
  const dA = anA.period.days.length, dB = anB.period.days.length
  if (dA !== dB) notes.push(`Os períodos têm durações diferentes (${dA} e ${dB} dias). Totais de tempo não são diretamente equivalentes.`)
  const fieldDiff = (Object.keys(A.fieldSnapshot.fields) as FieldKey[]).filter((k) => A.fieldSnapshot.fields[k].enabled !== B.fieldSnapshot.fields[k].enabled)
  if (fieldDiff.length) notes.push(`Campos habilitados diferentes entre as avaliações: ${fieldDiff.map((k) => FIELD_LABEL[k]).join(', ')}. Indicadores desses campos não são comparáveis.`)
  if (A.fieldSnapshot.discomfortMultiple !== B.fieldSnapshot.discomfortMultiple) notes.push('Uma avaliação permite múltiplos tipos de desconforto e a outra não: contagens de desconforto não são equivalentes.')
  if (A.fillFormats.join() !== B.fillFormats.join()) notes.push('Os formatos de preenchimento são diferentes.')
  if (A.methodologyVersion !== B.methodologyVersion) notes.push('As versões de metodologia/catálogo são diferentes.')
  if (A.targetType !== B.targetType) notes.push('O público configurado (adulto/criança) é diferente.')
  if (onlyA.length || onlyB.length) notes.push('Há atividades exclusivas de uma das avaliações. Elas aparecem separadas e não são tratadas como zero.')
  const changed = common.filter((c) => c.labelChanged || c.areaChanged).length
  if (changed) notes.push(`${changed} atividade(s) em comum mudaram de nome ou de área entre as avaliações.`)
  return { common, onlyA, onlyB, notes, periodDaysA: dA, periodDaysB: dB }
}
