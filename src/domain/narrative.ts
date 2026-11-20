// Texto descritivo automático. Linguagem neutra (doc 01 §8.2):
// não infere causa, diagnóstico, déficit nem prioridade clínica.
import { pct, type Analysis } from './analytics'
import { DISCOMFORT_LABEL, FREQ_LABEL, formatDate, formatMinutes } from './labels'
import type { Discomfort, FrequencyUnit } from './types'

export function describe(an: Analysis): string[] {
  const out: string[] = []
  const nAct = an.activities.length
  const c = an.statusCounts
  const act = (st: string) => an.activities.filter((s) => s.status === st)
  out.push(`O período de referência foi de ${formatDate(an.period.start)} a ${formatDate(an.period.end)} (${an.period.days.length} dia(s)), com ${nAct} atividade(s) incluída(s) na avaliação.`)
  out.push(`Houve registro de realização em ${act('performed').length} atividade(s). Foi informado que ${act('not_performed').length} atividade(s) não são realizadas no período; ${act('not_applicable').length} foram marcadas como “não se aplica”, ${act('unknown').length} como “não sabe informar” e ${act('not_answered').length} ficaram sem resposta.`)
  if (an.totalMinutes > 0) {
    out.push(`Foram registrados ${formatMinutes(an.totalMinutes)} no total, considerando apenas os registros com tempo calculável.`)
    const top = [...an.activities].filter((s) => s.totalMinutes !== null).sort((x, y) => y.totalMinutes! - x.totalMinutes!).slice(0, 3)
    if (top.length) out.push(`As atividades com mais tempo registrado foram: ${top.map((s) => `${s.occupation.name} (${formatMinutes(s.totalMinutes)})`).join('; ')}.`)
    const areas = [...an.byArea].sort((x, y) => y.minutes - x.minutes)
    if (areas.length) out.push(`Por área, o tempo registrado foi: ${areas.map((a) => `${a.areaName}, ${formatMinutes(a.minutes)} (${pct(a.minutes, an.totalMinutes)})`).join('; ')}.`)
  } else out.push('Não houve registro de tempo calculável.')
  if (an.satisfaction.enabled) {
    const s = an.satisfaction
    out.push(s.valid
      ? `Entre ${s.valid} resposta(s) válida(s) de satisfação, o respondente informou satisfação em ${s.satisfied} (${pct(s.satisfied, s.valid)}) e insatisfação em ${s.dissatisfied} (${pct(s.dissatisfied, s.valid)}). ${s.unanswered} registro(s) de atividade realizada ficaram sem resposta de satisfação.`
      : 'Não houve respostas de satisfação.')
  }
  if (an.discomfort.enabled) {
    const d = an.discomfort
    const types = (['physical', 'mental', 'sensory'] as Discomfort[]).filter((k) => d.counts[k] > 0)
    if (d.validRecords) {
      out.push(`Em ${d.validRecords} registro(s) com resposta de desconforto, houve registro de ${types.length ? types.map((k) => `desconforto ${DISCOMFORT_LABEL[k].toLowerCase()} em ${d.counts[k]}`).join(', ') : 'nenhum tipo de desconforto'}, e “sem desconforto” em ${d.counts.none}.${d.multiple ? ' Como mais de um tipo podia ser marcado, as categorias podem se sobrepor.' : ''}`)
    } else out.push('Não houve respostas sobre desconforto.')
  }
  const fu = (Object.keys(an.frequencyByUnit) as FrequencyUnit[]).filter((u) => an.frequencyByUnit[u].length)
  if (fu.length) out.push(`Frequências habituais foram informadas ${fu.map((u) => `${FREQ_LABEL[u]} (${an.frequencyByUnit[u].length} registro(s))`).join(', ')}. Cada unidade é apresentada separadamente, sem conversão.`)
  const warn = an.alerts.filter((a) => a.level === 'warning').length
  if (warn) out.push(`Há ${warn} alerta(s) de consistência para conferência profissional.`)
  return out
}
