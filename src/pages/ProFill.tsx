import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { analyze } from '../domain/analytics'
import { SOURCE_LABEL } from '../domain/labels'
import type { SourceOfInformation } from '../domain/types'
import { pro, recordsOfSession, useStore, type RecordInput } from '../data/store'
import { ResponseForm, reviewIssues } from '../components/ResponseForm'
import { Alert, Field } from '../ui/common'

export function ProFill() {
  const { id } = useParams(); const nav = useNavigate(); const s = useStore()
  const a = s.assessments.find((x) => x.id === id)
  const [source, setSource] = useState<SourceOfInformation>('interview')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [review, setReview] = useState<RecordInput[] | null>(null)
  const [err, setErr] = useState('')
  const sess = s.sessions.find((x) => x.id === sessionId) ?? null
  const persist = useMemo(() => async (recs: RecordInput[], notes: string) => {
    if (!sessionId) return { ok: false as const, message: 'Sessão não iniciada.' }
    const r = pro.saveProRecords(sessionId, recs.map((x) => ({ ...x, entryMode: 'professional_interview' as const })), notes)
    return 'error' in r ? { ok: false as const, message: r.error } : { ok: true as const }
  }, [sessionId])
  if (!a) return <p>Avaliação não encontrada. <Link to="/">Voltar</Link></p>
  if (a.status === 'cancelled' || a.status === 'finalized') return <Alert tone="warn">Esta avaliação está encerrada. <Link to={`/avaliacoes/${a.id}`}>Voltar</Link></Alert>

  if (!sessionId) return (
    <div className="center"><div className="card"><h1>Preencher como profissional</h1>
      <p className="muted">{a.title}</p>
      <Alert tone="info">O registro ficará identificado como respondido pelo <b>profissional</b>, com a fonte da informação escolhida abaixo. Autorrelato e observação profissional não são tratados como equivalentes.</Alert>
      <Field label="Fonte da informação" id="src"><select id="src" value={source} onChange={(e) => setSource(e.target.value as SourceOfInformation)}>{(['interview', 'professional_observation', 'self_report', 'guardian_report', 'mixed'] as SourceOfInformation[]).map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}</select></Field>
      {err && <Alert tone="bad">{err}</Alert>}
      <div className="row"><button onClick={() => { try { setSessionId(pro.startProSession(a.id, source)) } catch (e) { setErr((e as Error).message) } }}>Começar</button><Link className="btn secondary" to={`/avaliacoes/${a.id}`}>Voltar</Link></div></div></div>
  )
  if (review) {
    const r = reviewIssues(a, review)
    const an = analyze(a, review.map((x) => ({ ...x, id: '', assessmentId: a.id, sessionId: sessionId, entryMode: 'professional_interview', updatedAt: '' })))
    return <div className="center"><div className="card"><h1>Revisar</h1>
      {r.errors.map((e, i) => <Alert key={i} tone="bad">{e}</Alert>)}
      {an.alerts.filter((x) => x.level === 'warning').map((x, i) => <Alert key={i} tone="warn">{x.message}</Alert>)}
      <p>{a.catalogSnapshot.length - r.unanswered.length} de {a.catalogSnapshot.length} atividades respondidas · {r.unanswered.length} sem resposta.</p>
      <div className="row"><button className="secondary" onClick={() => setReview(null)}>Voltar a editar</button>
        <button disabled={r.errors.length > 0} onClick={() => { pro.submitProSession(sessionId); nav(`/avaliacoes/${a.id}`) }}>Concluir registro</button></div></div></div>
  }
  return <>
    <p><Link to={`/avaliacoes/${a.id}`}>← Voltar</Link></p><h1>{a.title}</h1>
    <p className="muted">Registro do profissional — fonte: {SOURCE_LABEL[sess?.sourceOfInformation ?? source]}</p>
    <ResponseForm assessment={a} initial={recordsOfSession(s, sessionId)} initialNotes={sess?.respondentNotes ?? ''} persist={persist} onReview={(r) => setReview(r)} reviewLabel="Revisar e concluir" />
  </>
}
