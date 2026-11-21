import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { pct, type Analysis } from '../domain/analytics'
import { DISCOMFORT_LABEL, FREQ_LABEL, SATISFACTION_LABEL, STATUS_LABEL, formatDate, formatMinutes, weekdayName } from '../domain/labels'
import type { Discomfort, FrequencyUnit, RecordStatus } from '../domain/types'

const C = { brand: '#1f6f6b', accent: '#b4572a', grey: '#8b9a96', soft: '#6aa8a3', ok: '#2c7a4b', bad: '#a32b2b' }

function Box({ title, summary, children, fixed, h = 260 }: { title: string; summary: string; children: (w?: number) => ReactNode; fixed?: boolean; h?: number }) {
  return (
    <figure style={{ margin: 0 }} aria-label={title}>
      <h3>{title}</h3>
      <div role="img" aria-label={`${title}. ${summary}`} style={{ width: '100%', height: h }}>
        {fixed ? children(640) : <ResponsiveContainer width="100%" height="100%">{children() as React.ReactElement}</ResponsiveContainer>}
      </div>
    </figure>
  )
}
const minFmt = (v: unknown) => formatMinutes(Number(v))

export function Charts({ an, fixed }: { an: Analysis; fixed?: boolean }) {
  const byDay = an.byDay.map((d) => ({ name: `${weekdayName(d.date).slice(0, 3)} ${formatDate(d.date).slice(0, 5)}`, minutos: d.minutes }))
  const byArea = [...an.byArea].sort((a, b) => b.minutes - a.minutes).map((a) => ({ name: a.areaName, minutos: a.minutes }))
  const top = [...an.activities].filter((s) => s.totalMinutes).sort((a, b) => b.totalMinutes! - a.totalMinutes!).slice(0, 10).map((s) => ({ name: s.occupation.name.length > 34 ? s.occupation.name.slice(0, 33) + '…' : s.occupation.name, minutos: s.totalMinutes! }))
  const statuses = (Object.keys(an.statusCounts) as RecordStatus[]).map((s) => ({ name: STATUS_LABEL[s], n: an.statusCounts[s] }))
  const sat = [{ name: SATISFACTION_LABEL.satisfied, n: an.satisfaction.satisfied }, { name: SATISFACTION_LABEL.dissatisfied, n: an.satisfaction.dissatisfied }]
  const dis = (['physical', 'mental', 'sensory', 'none'] as Discomfort[]).map((d) => ({ name: DISCOMFORT_LABEL[d], n: an.discomfort.counts[d] }))

  const hOf = (n: number) => Math.max(180, n * 30 + 40)
  const vertical = (data: { name: string; minutos: number }[], w?: number) => (
    <BarChart width={w} height={w ? 260 : undefined} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={data.length > 7 ? -35 : 0} textAnchor={data.length > 7 ? 'end' : 'middle'} height={data.length > 7 ? 60 : 30} />
      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 60 * 10) / 10}h`} /><Tooltip formatter={minFmt} />
      <Bar dataKey="minutos" name="Tempo" fill={C.brand} isAnimationActive={false} />
    </BarChart>
  )
  const horizontal = (data: { name: string; minutos: number }[], w?: number) => (
    <BarChart width={w} height={w ? Math.max(180, data.length * 30 + 40) : undefined} data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 60 * 10) / 10}h`} />
      <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} /><Tooltip formatter={minFmt} />
      <Bar dataKey="minutos" name="Tempo" fill={C.soft} isAnimationActive={false} />
    </BarChart>
  )
  const counts = (data: { name: string; n: number }[], colors: string[], w?: number) => (
    <BarChart width={w} height={w ? hOf(data.length) : undefined} data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} /><Tooltip />
      <Bar dataKey="n" name="Registros" isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Bar>
    </BarChart>
  )
  
  return (
    <div className="grid" style={{ gridTemplateColumns: fixed ? '1fr' : 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))' }}>
      <Box title="Tempo registrado por dia" summary={`Total ${formatMinutes(an.totalMinutes)} no período.`} fixed={fixed}>{(w) => vertical(byDay, w)}</Box>
      {byArea.length > 0 && <Box title="Tempo por área" summary={byArea.map((a) => `${a.name}: ${formatMinutes(a.minutos)}`).join('; ')} fixed={fixed} h={hOf(byArea.length)}>{(w) => horizontal(byArea, w)}</Box>}
      {top.length > 0 && <Box title="Atividades com mais tempo (até 10)" summary={top.map((a) => `${a.name}: ${formatMinutes(a.minutos)}`).join('; ')} fixed={fixed} h={hOf(top.length)}>{(w) => horizontal(top, w)}</Box>}
      <Box title="Situação dos registros" summary={statuses.map((s) => `${s.name}: ${s.n}`).join('; ')} fixed={fixed} h={hOf(statuses.length)}>{(w) => counts(statuses, [C.ok, C.grey, C.grey, C.grey, C.accent], w)}</Box>
      {an.satisfaction.enabled && <Box title={`Satisfação (${an.satisfaction.valid} resposta(s) válida(s))`} summary={`Satisfeito ${an.satisfaction.satisfied}, insatisfeito ${an.satisfaction.dissatisfied}; sem resposta ${an.satisfaction.unanswered}.`} fixed={fixed} h={hOf(sat.length)}>{(w) => counts(sat, [C.ok, C.accent], w)}</Box>}
      {an.discomfort.enabled && <Box title={`Desconforto (${an.discomfort.validRecords} registro(s) com resposta)`} summary={dis.map((d) => `${d.name}: ${d.n}`).join('; ')} fixed={fixed} h={hOf(dis.length)}>{(w) => counts(dis, [C.brand, C.brand, C.brand, C.grey], w)}</Box>}
    </div>
  )
}

export function Kpis({ an }: { an: Analysis }) {
  const act = (s: RecordStatus) => an.activities.filter((x) => x.status === s).length
  return (
    <div className="grid g4">
      <div className="kpi"><b>{formatMinutes(an.totalMinutes)}</b><span>tempo total registrado (apenas registros calculáveis)</span></div>
      <div className="kpi"><b>{act('performed')} / {an.activities.length}</b><span>atividades com registro de realização</span></div>
      <div className="kpi"><b>{act('not_performed')}</b><span>atividades que não realiza no período</span></div>
      <div className="kpi"><b>{act('not_answered')}</b><span>sem resposta ({act('not_applicable')} não se aplica, {act('unknown')} não sabe)</span></div>
    </div>
  )
}

export function Indicators({ an }: { an: Analysis }) {
  const s = an.satisfaction
  const d = an.discomfort
  const fu = (Object.keys(an.frequencyByUnit) as FrequencyUnit[]).filter((u) => an.frequencyByUnit[u].length)
  return (
    <div className="grid g2">
      {s.enabled && <div className="card"><h3>Satisfação</h3>
        <p className="mb0">Satisfeito: <b>{s.satisfied}</b> de {s.valid} ({pct(s.satisfied, s.valid)})<br />Insatisfeito: <b>{s.dissatisfied}</b> de {s.valid} ({pct(s.dissatisfied, s.valid)})<br /><span className="muted">Sem resposta de satisfação: {s.unanswered}. Denominador = respostas válidas.</span></p></div>}
      {d.enabled && <div className="card"><h3>Desconforto</h3>
        <p className="mb0">Registros com resposta: <b>{d.validRecords}</b> (sem resposta: {d.unanswered})<br />
          Físico {d.counts.physical} · Mental {d.counts.mental} · Sensorial {d.counts.sensory} · Sem desconforto {d.counts.none}<br />
          {d.multiple && <span className="muted">Mais de um tipo podia ser marcado: as categorias podem se sobrepor e somar mais de 100%.</span>}</p></div>}
      {fu.length > 0 && <div className="card"><h3>Frequência habitual informada</h3>
        {fu.map((u) => <p key={u} className="small mb0"><b>{FREQ_LABEL[u]}</b>: {an.frequencyByUnit[u].map((x) => `${x.name} (${x.value}×)`).join('; ')}</p>)}
        <p className="small muted">Cada unidade é mostrada separadamente; não há conversão entre dia, semana, mês e ano.</p></div>}
    </div>
  )
}
