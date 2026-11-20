// Casos de teste do doc 04 §3 (numerados como no original) + regras do doc 02.
import { describe, expect, it } from 'vitest'
import { analyze, recordTotal } from '../src/domain/analytics'
import { buildAreas, buildSourceCatalog, defaultFieldConfig, periodDates, snapshotOccupation } from '../src/domain/catalog'
import { compareAssessments } from '../src/domain/comparison'
import { describe as narrate } from '../src/domain/narrative'
import { generateToken, sha256Hex } from '../src/domain/token'
import type { ActivityRecord, Assessment } from '../src/domain/types'
import { validateRecord } from '../src/domain/validation'

const areas = buildAreas()
const catalog = buildSourceCatalog()
const snap = (keys: string[]) => keys.map((k) => snapshotOccupation(catalog.find((o) => o.stableKey === k)!, areas))

function assessment(keys: string[], start = '2026-11-02', end = '2026-11-08', over: Partial<Assessment> = {}): Assessment {
  return {
    id: 'a', organizationId: 'o', patientId: 'p', createdBy: 'u', title: 't', targetType: 'adult',
    fillFormats: ['by_activity', 'weekly_routine'], startDate: start, endDate: end,
    expectedRespondent: 'patient', expectedSource: 'self_report', instructions: '', status: 'submitted',
    catalogSnapshot: snap(keys), fieldSnapshot: defaultFieldConfig(), methodologyVersion: 'v1',
    submittedAt: null, finalizedAt: null, createdAt: '', updatedAt: '', ...over,
  }
}
let n = 0
function rec(occupationId: string, p: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: `r${n++}`, assessmentId: 'a', sessionId: 's', occupationId, recordDate: null, status: 'performed',
    durationMinutes: null, occurrenceCount: null, directTotalMinutes: null, frequencyValue: null, frequencyUnit: null,
    satisfaction: null, discomfort: [], startTime: null, endTime: null, notes: '', entryMode: 'by_activity', updatedAt: '', ...p,
  }
}
const BANHO = 'orig-row-011', VESTIR = 'orig-row-012', ALIM = 'orig-row-013'

describe('catálogo original', () => {
  it('preserva 100 entradas, numeração duplicada 94 e lacuna 95', () => {
    expect(catalog).toHaveLength(100)
    expect(catalog.filter((o) => o.sourceNumber === 94).map((o) => o.name)).toEqual(['Ir a confraternizações', 'Ir a museus'])
    expect(catalog.some((o) => o.sourceNumber === 95)).toBe(false)
    expect(new Set(catalog.map((o) => o.id)).size).toBe(100)
  })
  it('cria subáreas de Lazer', () => {
    expect(areas.filter((a) => a.parentCode === 'lazer').map((a) => a.name)).toEqual(['Em casa', 'Em espaços da cidade', 'Em espaços fora da cidade'])
  })
  it('período personalizado não assume semana completa', () => {
    expect(periodDates('2026-11-06', '2026-11-09')).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])
  })
})

describe('doc 04 §3 — casos de cálculo', () => {
  it('1. 15 min × 2 ocorrências = 30 min', () => {
    expect(recordTotal(rec(BANHO, { durationMinutes: 15, occurrenceCount: 2 }))).toEqual({ minutes: 30, basis: 'duration_x_count' })
  })
  it('2. duração sem quantidade não gera total', () => {
    const r = rec(BANHO, { durationMinutes: 15 })
    expect(recordTotal(r)).toEqual({ minutes: null, basis: 'not_computable' })
    const an = analyze(assessment([BANHO]), [r])
    expect(an.activities[0].totalMinutes).toBeNull()
    expect(an.alerts.some((a) => a.code === 'duration_without_count')).toBe(true)
  })
  it('2b. total informado diretamente não é multiplicado', () => {
    expect(recordTotal(rec(BANHO, { directTotalMinutes: 40, durationMinutes: 20, occurrenceCount: 2 })).minutes).toBe(40)
  })
  it('3. frequência semanal continua semanal', () => {
    const an = analyze(assessment([BANHO]), [rec(BANHO, { frequencyValue: 3, frequencyUnit: 'week' })])
    expect(an.frequencyByUnit.week).toEqual([{ occupationId: BANHO, name: 'Banho', value: 3 }])
    expect(an.frequencyByUnit.day).toEqual([])
  })
  it('4. not_performed não é somado como zero e o estado é exibido', () => {
    const an = analyze(assessment([BANHO]), [rec(BANHO, { status: 'not_performed' })])
    expect(an.activities[0].totalMinutes).toBeNull()
    expect(an.activities[0].status).toBe('not_performed')
    expect(an.statusCounts.not_performed).toBe(1)
  })
  it('5. not_answered não se confunde com not_performed', () => {
    const an = analyze(assessment([BANHO, VESTIR]), [rec(BANHO, { status: 'not_performed' })])
    expect(an.activities[1].status).toBe('not_answered')
    expect(an.statusCounts).toMatchObject({ not_performed: 1, not_answered: 1 })
  })
  it('6. dia acima de 1.440 min gera alerta sem alterar dados', () => {
    const recs = [rec(BANHO, { recordDate: '2026-11-03', directTotalMinutes: 1000 }), rec(VESTIR, { recordDate: '2026-11-03', directTotalMinutes: 500 })]
    const an = analyze(assessment([BANHO, VESTIR]), recs)
    expect(an.byDay.find((d) => d.date === '2026-11-03')!.minutes).toBe(1500)
    expect(an.alerts.some((a) => a.code === 'day_over_1440')).toBe(true)
  })
  it('7. “sem desconforto” + “físico” é bloqueado', () => {
    const issues = validateRecord(rec(BANHO, { discomfort: ['none', 'physical'] }))
    expect(issues.some((i) => i.code === 'none_with_discomfort' && i.level === 'error')).toBe(true)
  })
  it('8. múltiplos desconfortos = 1 registro e várias categorias (se habilitado)', () => {
    const a = assessment([BANHO]); a.fieldSnapshot.discomfortMultiple = true
    const an = analyze(a, [rec(BANHO, { discomfort: ['physical', 'mental'] })])
    expect(an.discomfort.validRecords).toBe(1)
    expect(an.discomfort.counts).toMatchObject({ physical: 1, mental: 1 })
    expect(validateRecord(rec(BANHO, { discomfort: ['physical', 'mental'] }), a.fieldSnapshot)).toEqual([])
    expect(validateRecord(rec(BANHO, { discomfort: ['physical', 'mental'] }), defaultFieldConfig()).some((i) => i.code === 'multiple_discomfort_disabled')).toBe(true)
  })
  it('9. comparação separa comuns e exclusivos, sem zero', () => {
    const A = assessment([BANHO, VESTIR]), B = assessment([VESTIR, ALIM])
    const c = compareAssessments(A, [rec(BANHO, { directTotalMinutes: 10 }), rec(VESTIR, { directTotalMinutes: 20 })], B, [rec(VESTIR, { directTotalMinutes: 25 })])
    expect(c.common.map((x) => x.key)).toEqual([VESTIR])
    expect(c.common[0].deltaMinutes).toBe(5)
    expect(c.onlyA.map((x) => x.occupation.stableKey)).toEqual([BANHO])
    expect(c.onlyB.map((x) => x.occupation.stableKey)).toEqual([ALIM])
    expect(c.onlyB[0].totalMinutes).toBeNull()
  })
  it('9b. sem dado em uma das avaliações → diferença não calculada', () => {
    const c = compareAssessments(assessment([BANHO]), [rec(BANHO, { directTotalMinutes: 10 })], assessment([BANHO]), [])
    expect(c.common[0].deltaMinutes).toBeNull()
  })
  it('10. mudança de rótulo no catálogo não altera o snapshot histórico', () => {
    const occ = { ...catalog[0] }
    const frozen = snapshotOccupation(occ, areas)
    occ.name = 'Banho (renomeado)'
    expect(frozen.name).toBe('Banho')
    const c = compareAssessments(assessment([BANHO]), [], { ...assessment([BANHO]), catalogSnapshot: [snapshotOccupation(occ, areas)] }, [])
    expect(c.common[0].labelChanged).toBe(true)
  })
})

describe('doc 02 — regras adicionais', () => {
  it('ADR-004: registros diários e de período não são somados em dobro', () => {
    const recs = [rec(BANHO, { recordDate: '2026-11-02', directTotalMinutes: 20 }), rec(BANHO, { recordDate: '2026-11-03', directTotalMinutes: 15 }), rec(BANHO, { directTotalMinutes: 200 })]
    const an = analyze(assessment([BANHO]), recs)
    expect(an.activities[0].totalMinutes).toBe(35)
    expect(an.totalMinutes).toBe(35)
    expect(an.alerts.some((a) => a.code === 'period_and_daily')).toBe(true)
  })
  it('validações §8', () => {
    const codes = (p: Partial<ActivityRecord>) => validateRecord(rec(BANHO, p)).map((i) => i.code)
    expect(codes({ durationMinutes: -5 })).toContain('schema.durationMinutes')
    expect(codes({ occurrenceCount: -1 })).toContain('schema.occurrenceCount')
    expect(codes({ frequencyValue: 3 })).toContain('frequency_without_unit')
    expect(codes({ status: 'not_performed', durationMinutes: 10 })).toContain('not_performed_with_time')
    expect(codes({ status: 'not_applicable', directTotalMinutes: 10 })).toContain('not_applicable_with_time')
  })
  it('satisfação mostra denominador e não respondidas', () => {
    const an = analyze(assessment([BANHO, VESTIR, ALIM]), [rec(BANHO, { satisfaction: 'satisfied' }), rec(VESTIR, { satisfaction: 'dissatisfied' }), rec(ALIM)])
    expect(an.satisfaction).toMatchObject({ satisfied: 1, dissatisfied: 1, valid: 2, unanswered: 1 })
  })
  it('campo desabilitado não conta como ausente', () => {
    const a = assessment([BANHO]); a.fieldSnapshot.fields.satisfaction.enabled = false
    const an = analyze(a, [rec(BANHO)])
    expect(an.satisfaction).toMatchObject({ enabled: false, unanswered: 0 })
  })
  it('registro fora do período não é somado', () => {
    const an = analyze(assessment([BANHO]), [rec(BANHO, { recordDate: '2026-12-01', directTotalMinutes: 30 })])
    expect(an.totalMinutes).toBe(0)
    expect(an.alerts.some((a) => a.code === 'record_outside_period')).toBe(true)
  })
  it('texto descritivo usa linguagem neutra', () => {
    const txt = narrate(analyze(assessment([BANHO, VESTIR]), [rec(BANHO, { directTotalMinutes: 30, satisfaction: 'satisfied' })])).join(' ')
    expect(txt).toContain('Foram registrados 30 min')
    expect(txt).not.toMatch(/diagn|déficit|deficit|recomend|prioridade|deve /i)
  })
})

describe('tokens', () => {
  it('256 bits, únicos e com hash hex de 64 caracteres', async () => {
    const t = generateToken()
    expect(t.length).toBeGreaterThanOrEqual(43)
    expect(generateToken()).not.toBe(t)
    expect(await sha256Hex(t)).toMatch(/^[0-9a-f]{64}$/)
  })
})
