import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { analyze } from '../domain/analytics'
import { FIELD_LABEL, FORMAT_LABEL, GUARDIAN_MODE_LABEL, RESPONDENT_LABEL, SOURCE_LABEL, TARGET_LABEL, formatDate, formatDateTime } from '../domain/labels'
import { describe } from '../domain/narrative'
import type { FieldKey } from '../domain/types'
import { pro, recordsOfSession, referenceSession, useStore } from '../data/store'
import { Charts, Indicators, Kpis } from '../components/Charts'
import { ActivitiesTable } from './AssessmentDetail'
import { Alert } from '../ui/common'

export function Report() {
  const { id } = useParams(); const [qs] = useSearchParams(); const s = useStore()
  const a = s.assessments.find((x) => x.id === id)
  const sess = a ? s.sessions.find((x) => x.id === qs.get('sessao')) ?? referenceSession(s, a.id) : null
  const recs = recordsOfSession(s, sess?.id ?? null)
  const an = useMemo(() => (a ? analyze(a, recs) : null), [a, recs])
  const note = s.notes.find((n) => n.assessmentId === id && n.noteType === 'professional_analysis')
  const [text, setText] = useState(note?.body ?? ''); const [saved, setSaved] = useState(false)
  if (!a || !an) return <p>Avaliação não encontrada. <Link to="/">Voltar</Link></p>
  if (!sess) return <Alert tone="info">Ainda não há respostas para gerar o relatório. <Link to={`/avaliacoes/${a.id}`}>Voltar</Link></Alert>
  const patient = s.patients.find((p) => p.id === a.patientId)
  const off = (Object.keys(a.fieldSnapshot.fields) as FieldKey[]).filter((k) => !a.fieldSnapshot.fields[k].enabled)
  const narrative = describe(an)
  const unanswered = an.activities.filter((x) => x.status === 'not_answered')

  return (
    <>
      <div className="row between noprint"><Link to={`/avaliacoes/${a.id}${sess ? `?sessao=${sess.id}` : ''}`}>← Voltar à avaliação</Link>
        <button onClick={() => { pro.logReport(a.id); window.print() }}>Imprimir / salvar como PDF</button></div>
      <div className="card noprint mt"><h2>Considerações do profissional</h2>
        <p className="small muted">Texto livre, escrito e revisado por você. Entra no relatório abaixo. A descrição automática não faz interpretação clínica.</p>
        <label htmlFor="cons" className="hint">Considerações</label>
        <textarea id="cons" style={{ minHeight: 140 }} value={text} onChange={(e) => { setText(e.target.value); setSaved(false) }} />
        <div className="row mt"><button onClick={() => { pro.saveNote(a.id, 'professional_analysis', text); setSaved(true) }}>Salvar considerações</button>{saved && <span className="small muted" role="status">Salvo.</span>}</div></div>

      <article className="report" aria-label="Relatório">
        <h1>Relatório de Orquestração Ocupacional</h1>
        <p className="muted">{a.title}</p>
        <h2>Identificação</h2>
        <p><b>Paciente:</b> {patient?.displayName} ({TARGET_LABEL[a.targetType]}){patient?.birthDate && <> · nascimento {formatDate(patient.birthDate)}</>}<br />
          <b>Período de referência:</b> {formatDate(a.startDate)} a {formatDate(a.endDate)} ({an.period.days.length} dia(s))<br />
          <b>Formato de preenchimento:</b> {a.fillFormats.map((f) => FORMAT_LABEL[f]).join(' + ')}<br />
          <b>Respondente:</b> {RESPONDENT_LABEL[sess.respondentType]}{sess.respondentName && ` — ${sess.respondentName}`}{sess.relationshipToPatient && ` (${sess.relationshipToPatient})`}<br />
          <b>Fonte da informação:</b> {SOURCE_LABEL[sess.sourceOfInformation]}{sess.guardianMode && <> · {GUARDIAN_MODE_LABEL[sess.guardianMode]}</>}<br />
          <b>Registro enviado em:</b> {formatDateTime(sess.submittedAt)}{sess.status !== 'submitted' && ' (preenchimento ainda em andamento)'}</p>
        {sess.sourceOfInformation === 'professional_observation' && <p><i>Os dados vêm de observação profissional e não são equivalentes a autorrelato.</i></p>}
        <h2>Síntese dos dados registrados</h2>
        {narrative.map((p, i) => <p key={i}>{p}</p>)}
        <h2>Indicadores</h2><Kpis an={an} /><div className="mt" /><Indicators an={an} />
        <h2>Gráficos</h2><Charts an={an} fixed />
        <h2>Atividades</h2><ActivitiesTable an={an} />
        {sess.respondentNotes && <><h2>Observações do respondente</h2><p style={{ whiteSpace: 'pre-wrap' }}>{sess.respondentNotes}</p></>}
        <h2>Considerações do profissional</h2>
        {text.trim() ? <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p> : <p className="muted">(sem considerações registradas)</p>}
        <h2>Limitações e dados não respondidos</h2>
        <ul>
          <li>{unanswered.length} atividade(s) sem resposta{unanswered.length > 0 && unanswered.length <= 12 ? `: ${unanswered.map((u) => u.occupation.name).join('; ')}` : ''}.</li>
          <li>Atividades marcadas como “não se aplica” ou “não sabe informar” não são contadas como tempo zero nem como “não realiza”.</li>
          {off.length > 0 && <li>Campos não habilitados nesta avaliação: {off.map((k) => FIELD_LABEL[k]).join(', ')}.</li>}
          {an.activities.some((x) => x.uncomputableRecords) && <li>Há registros com duração sem quantidade de vezes; esses totais não foram calculados.</li>}
          {an.alerts.filter((x) => x.level === 'warning').map((x, i) => <li key={i}>{x.message}</li>)}
          <li>Frequências em unidades diferentes (dia, semana, mês, ano) não foram convertidas entre si.</li>
          <li>Este relatório organiza informações relatadas e não emite diagnóstico, classificação clínica ou recomendação terapêutica.</li>
        </ul>
        <p className="small muted">Versão da metodologia/catálogo: {a.methodologyVersion}. Gerado em {formatDateTime(new Date().toISOString())}. Classificação do catálogo em validação clínica.</p>
      </article>
    </>
  )
}
