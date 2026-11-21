import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compareAssessments } from '../domain/comparison'
import { STATUS_LABEL, formatDate, formatMinutes } from '../domain/labels'
import type { ActivitySummary } from '../domain/analytics'
import { recordsOfSession, referenceSession, useStore } from '../data/store'
import { Alert, Empty } from '../ui/common'

export function Compare() {
  const { patientId } = useParams(); const s = useStore()
  const list = s.assessments.filter((a) => a.patientId === patientId && referenceSession(s, a.id)).sort((x, y) => x.startDate.localeCompare(y.startDate))
  const patient = s.patients.find((p) => p.id === patientId)
  const [ia, setIa] = useState(list[0]?.id ?? ''); const [ib, setIb] = useState(list[1]?.id ?? list[0]?.id ?? '')
  const [mode, setMode] = useState<'common' | 'extended'>('common')
  const A = list.find((x) => x.id === ia); const B = list.find((x) => x.id === ib)
  const cmp = useMemo(() => {
    if (!A || !B || A.id === B.id) return null
    return compareAssessments(A, recordsOfSession(s, referenceSession(s, A.id)!.id), B, recordsOfSession(s, referenceSession(s, B.id)!.id))
  }, [A, B, s])
  const label = (x: typeof A) => (x ? `${x.title} (${formatDate(x.startDate)}–${formatDate(x.endDate)})` : '')
  const chartData = (cmp?.common ?? []).filter((c) => c.a.totalMinutes !== null || c.b.totalMinutes !== null).slice(0, 15).map((c) => ({ name: c.a.occupation.name.slice(0, 28), A: c.a.totalMinutes ?? undefined, B: c.b.totalMinutes ?? undefined }))
  const exTable = (rows: ActivitySummary[], title: string) => rows.length > 0 && <div className="card tablewrap"><h3>{title}</h3><table><thead><tr><th>Atividade</th><th>Situação</th><th className="num">Tempo total</th></tr></thead><tbody>
    {rows.map((r) => <tr key={r.occupation.stableKey}><td>{r.occupation.name}</td><td>{STATUS_LABEL[r.status]}</td><td className="num">{formatMinutes(r.totalMinutes)}</td></tr>)}</tbody></table></div>
  return (
    <>
      <p><Link to={`/pacientes/${patientId}`}>← {patient?.displayName}</Link></p><h1>Comparar avaliações</h1>
      {list.length < 2 ? <Empty>É preciso ao menos duas avaliações com respostas.</Empty> : <>
        <div className="card"><div className="grid g2">
          <div><label htmlFor="ca">Avaliação A</label><select id="ca" value={ia} onChange={(e) => setIa(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select></div>
          <div><label htmlFor="cb">Avaliação B</label><select id="cb" value={ib} onChange={(e) => setIb(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select></div></div>
          <div className="choices mt" role="radiogroup" aria-label="Modo de comparação">
            <label className="choice"><input type="radio" name="m" checked={mode === 'common'} onChange={() => setMode('common')} />Somente atividades em comum</label>
            <label className="choice"><input type="radio" name="m" checked={mode === 'extended'} onChange={() => setMode('extended')} />Visão ampliada (com atividades exclusivas)</label></div></div>
        {!cmp ? <Alert tone="info">Escolha duas avaliações diferentes.</Alert> : <>
          <div className="card"><h2>O que é comparável</h2>
            {cmp.notes.length === 0 ? <p className="mb0">Mesmo período, campos, formatos e versão de metodologia.</p> : cmp.notes.map((n, i) => <Alert key={i} tone="warn">{n}</Alert>)}
            <p className="small muted mb0">Atividade ausente em uma das avaliações nunca é tratada como zero. A correspondência usa o identificador estável do catálogo, não o nome.</p></div>
          <div className="card tablewrap"><h2>Atividades em comum ({cmp.common.length})</h2>
            {cmp.common.length === 0 ? <Empty>Nenhuma atividade em comum.</Empty> : <table><thead><tr><th>Atividade</th><th>Situação A</th><th className="num">Tempo A</th><th>Situação B</th><th className="num">Tempo B</th><th className="num">B − A</th><th>Mudanças</th></tr></thead><tbody>
              {cmp.common.map((c) => <tr key={c.key}><td>{c.a.occupation.name}{c.labelChanged && <div className="small muted">B: {c.b.occupation.name}</div>}</td>
                <td>{STATUS_LABEL[c.a.status]}</td><td className="num">{formatMinutes(c.a.totalMinutes)}</td><td>{STATUS_LABEL[c.b.status]}</td><td className="num">{formatMinutes(c.b.totalMinutes)}</td>
                <td className="num">{c.deltaMinutes === null ? 'n/c' : `${c.deltaMinutes > 0 ? '+' : c.deltaMinutes < 0 ? '−' : ''}${formatMinutes(Math.abs(c.deltaMinutes))}`}</td>
                <td className="small">{[c.labelChanged && 'nome', c.areaChanged && 'área'].filter(Boolean).join(', ') || '—'}</td></tr>)}</tbody></table>}
            <p className="small muted mb0">n/c = não comparável: falta tempo calculável em uma das avaliações.</p></div>
          {chartData.length > 0 && <div className="card"><h2>Tempo por atividade em comum</h2><div role="img" aria-label="Gráfico comparando o tempo das atividades em comum" style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ bottom: 70 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" tick={{ fontSize: 10 }} height={70} /><YAxis tickFormatter={(v) => `${Math.round(Number(v) / 6) / 10}h`} /><Tooltip formatter={(v) => formatMinutes(Number(v))} /><Legend />
            <Bar dataKey="A" fill="#1f6f6b" name="Avaliação A" /><Bar dataKey="B" fill="#b4572a" name="Avaliação B" /></BarChart></ResponsiveContainer></div></div>}
          {mode === 'extended' && <>{exTable(cmp.onlyA, `Somente na avaliação A (${cmp.onlyA.length})`)}{exTable(cmp.onlyB, `Somente na avaliação B (${cmp.onlyB.length})`)}
            {!cmp.onlyA.length && !cmp.onlyB.length && <Empty>Não há atividades exclusivas: as duas avaliações têm as mesmas atividades.</Empty>}</>}
        </>}</>}
    </>
  )
}
