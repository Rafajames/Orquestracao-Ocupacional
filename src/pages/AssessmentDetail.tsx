import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { analyze } from '../domain/analytics'
import { FIELD_LABEL, FORMAT_LABEL, GUARDIAN_MODE_LABEL, RESPONDENT_LABEL, SOURCE_LABEL, STATUS_LABEL, DISCOMFORT_LABEL, FREQ_LABEL, SATISFACTION_LABEL, TARGET_LABEL, formatDate, formatDateTime, formatMinutes } from '../domain/labels'
import type { FieldKey } from '../domain/types'
import { linkIsActive, pro, recordsOfSession, referenceSession, useStore } from '../data/store'
import { Charts, Indicators, Kpis } from '../components/Charts'
import { Alert, Badge, CopyButton, Empty, StatusBadge } from '../ui/common'

type Tab = 'resumo' | 'atividades' | 'respondente' | 'links' | 'auditoria'
const TABS: [Tab, string][] = [['resumo', 'Resumo'], ['atividades', 'Atividades'], ['respondente', 'Respondente'], ['links', 'Links'], ['auditoria', 'Histórico']]

export function AssessmentDetail() {
  const { id } = useParams(); const [qs, setQs] = useSearchParams()
  const s = useStore()
  const a = s.assessments.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('resumo')
  const sessions = s.sessions.filter((x) => x.assessmentId === id)
  const ref = a ? referenceSession(s, a.id) : null
  const sessionId = qs.get('sessao') ?? ref?.id ?? null
  const sess = sessions.find((x) => x.id === sessionId) ?? null
  const recs = recordsOfSession(s, sess?.id ?? null)
  const an = useMemo(() => (a ? analyze(a, recs) : null), [a, recs])
  const [err, setErr] = useState('')
  if (!a || !an) return <p>Avaliação não encontrada. <Link to="/">Voltar</Link></p>
  const patient = s.patients.find((p) => p.id === a.patientId)
  const act = (fn: () => void) => { try { fn(); setErr('') } catch (e) { setErr((e as Error).message) } }
  const closed = a.status === 'cancelled' || a.status === 'finalized'

  return (
    <>
      <p className="noprint"><Link to="/">← Início</Link> {patient && <> · <Link to={`/pacientes/${patient.id}`}>{patient.displayName}</Link></>}</p>
      <div className="row between top">
        <div><h1>{a.title}</h1><p className="muted">{patient?.displayName} · {TARGET_LABEL[a.targetType]} · {formatDate(a.startDate)} a {formatDate(a.endDate)} · {a.fillFormats.map((f) => FORMAT_LABEL[f]).join(' + ')} <StatusBadge status={a.status} /></p></div>
        <div className="row">
          {!closed && <Link className="btn secondary" to={`/avaliacoes/${a.id}/preencher`}>Preencher como profissional</Link>}
          {sess && <Link className="btn" to={`/avaliacoes/${a.id}/relatorio?sessao=${sess.id}`}>Relatório</Link>}
        </div>
      </div>
      {err && <Alert tone="bad">{err}</Alert>}
      <div className="row noprint" style={{ marginBottom: '.8rem' }}>
        {a.status === 'submitted' && <button className="secondary small" onClick={() => act(() => pro.setStatus(a.id, 'under_review'))}>Iniciar revisão</button>}
        {(a.status === 'submitted' || a.status === 'under_review') && <button className="small" onClick={() => { if (confirm('Finalizar a avaliação? Depois disso ela fica bloqueada para novas respostas.')) act(() => pro.setStatus(a.id, 'finalized')) }}>Finalizar</button>}
        {a.status === 'finalized' && <button className="secondary small" onClick={() => { if (confirm('Reabrir para revisão? A reabertura fica registrada no histórico.')) act(() => pro.setStatus(a.id, 'under_review')) }}>Reabrir para revisão</button>}
        {!closed && <button className="danger small" onClick={() => { if (confirm('Cancelar esta avaliação? Isso não pode ser desfeito.')) act(() => pro.setStatus(a.id, 'cancelled')) }}>Cancelar avaliação</button>}
      </div>
      {sessions.length > 1 && <div className="card noprint"><label htmlFor="ses">Respostas exibidas (cada respondente é analisado separadamente, sem somar)</label>
        <select id="ses" value={sess?.id ?? ''} onChange={(e) => setQs({ sessao: e.target.value })}>{sessions.map((x) => <option key={x.id} value={x.id}>{RESPONDENT_LABEL[x.respondentType]}{x.respondentName ? ` — ${x.respondentName}` : ''} · {SOURCE_LABEL[x.sourceOfInformation]} · {x.status === 'submitted' ? 'enviada' : 'em andamento'}</option>)}</select></div>}

      <div className="tabs noprint" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'resumo' && (!sess ? <Empty>Ainda não há respostas. Gere um link na aba “Links” ou preencha como profissional.</Empty> : <>
        {sess.status === 'in_progress' && <Alert tone="warn">Preenchimento ainda em andamento: os números abaixo são parciais.</Alert>}
        {an.alerts.map((x, i) => <Alert key={i} tone={x.level === 'warning' ? 'warn' : 'info'}>{x.message}</Alert>)}
        <Kpis an={an} /><div className="mt" /><Indicators an={an} /><div className="card mt"><Charts an={an} /></div>
        <DisabledFields fields={a.fieldSnapshot.fields} />
      </>)}
      {tab === 'atividades' && <ActivitiesTable an={an} />}
      {tab === 'respondente' && (sessions.length === 0 ? <Empty>Sem respondentes ainda.</Empty> : sessions.map((x) => <div className="card" key={x.id}>
        <h2>{RESPONDENT_LABEL[x.respondentType]}{x.respondentName ? ` — ${x.respondentName}` : ''} <Badge tone={x.status === 'submitted' ? 'ok' : 'warn'}>{x.status === 'submitted' ? 'enviada' : 'em andamento'}</Badge></h2>
        <p className="mb0">Relação com o paciente: {x.relationshipToPatient || '—'}<br />Fonte da informação: <b>{SOURCE_LABEL[x.sourceOfInformation]}</b><br />
          {x.guardianMode && <>Participação: {GUARDIAN_MODE_LABEL[x.guardianMode]}<br /></>}
          Iniciada: {formatDateTime(x.startedAt)} · Enviada: {formatDateTime(x.submittedAt)}<br />Aviso de privacidade aceito: {formatDateTime(x.privacyAcceptedAt)}</p>
        {x.respondentNotes && <><h3 className="mt">Observações gerais do respondente</h3><p style={{ whiteSpace: 'pre-wrap' }}>{x.respondentNotes}</p></>}
        {x.sourceOfInformation === 'professional_observation' && <Alert tone="info">Observação profissional não é equivalente a autorrelato.</Alert>}
      </div>))}
      {tab === 'links' && <Links assessmentId={a.id} disabled={closed} />}
      {tab === 'auditoria' && <Audit assessmentId={a.id} />}
    </>
  )
}

function DisabledFields({ fields }: { fields: Record<FieldKey, { enabled: boolean }> }) {
  const off = (Object.keys(fields) as FieldKey[]).filter((k) => !fields[k].enabled)
  if (!off.length) return null
  return <p className="small muted">Campos não habilitados nesta avaliação (não contam como “sem resposta”): {off.map((k) => FIELD_LABEL[k]).join(', ')}.</p>
}

export function ActivitiesTable({ an }: { an: ReturnType<typeof analyze> }) {
  return <div className="card tablewrap"><table>
    <thead><tr><th>Atividade</th><th>Área</th><th>Situação</th><th className="num">Tempo total</th><th className="num">Dias c/ registro</th><th>Frequência</th><th>Satisfação</th><th>Desconforto</th><th>Observações</th></tr></thead>
    <tbody>{an.activities.map((x) => {
      const sat = an.satisfaction.enabled && (x.satisfaction.satisfied + x.satisfaction.dissatisfied) ? (x.satisfaction.satisfied ? SATISFACTION_LABEL.satisfied : '') + (x.satisfaction.dissatisfied ? ' ' + SATISFACTION_LABEL.dissatisfied : '') : '—'
      const dis = an.discomfort.enabled ? (Object.entries(x.discomfort).filter(([, n]) => n > 0).map(([k]) => DISCOMFORT_LABEL[k as keyof typeof DISCOMFORT_LABEL]).join(', ') || '—') : '—'
      return <tr key={x.occupation.occupationId}>
        <td>{x.occupation.name}</td><td>{x.occupation.subareaName ? `${x.occupation.areaName} · ${x.occupation.subareaName}` : x.occupation.areaName}</td>
        <td>{STATUS_LABEL[x.status]}</td>
        <td className="num">{x.totalMinutes !== null ? formatMinutes(x.totalMinutes) : x.uncomputableRecords ? <span title="Duração sem quantidade de vezes">não calculado</span> : '—'}</td>
        <td className="num">{x.daysPerformed || '—'}</td>
        <td>{x.frequencies.map((f) => `${f.value}× ${FREQ_LABEL[f.unit]}`).join('; ') || '—'}</td><td>{sat}</td><td>{dis}</td>
        <td className="small">{x.notes.join(' | ') || '—'}</td></tr>
    })}</tbody></table></div>
}

function Links({ assessmentId, disabled }: { assessmentId: string; disabled: boolean }) {
  const s = useStore()
  const [days, setDays] = useState(14); const [fresh, setFresh] = useState<{ url: string } | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const links = s.links.filter((l) => l.assessmentId === assessmentId)
  const make = async () => {
    setBusy(true)
    try { const exp = new Date(Date.now() + days * 864e5); const t = await pro.createLink(assessmentId, exp); setFresh({ url: `${location.origin}${location.pathname}#/r/${t}` }); setErr('') } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return <>
    <div className="card"><h2>Novo link individual</h2>
      <p className="small muted">O respondente abre o link sem criar conta. O link expira e pode ser revogado a qualquer momento. Não há nome nem dados pessoais na URL.</p>
      <div className="row"><label htmlFor="val" className="mb0">Validade</label><select id="val" style={{ maxWidth: 200 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} dia(s)</option>)}</select>
        <button disabled={disabled || busy} onClick={() => { void make() }}>Gerar link</button></div>
      {err && <Alert tone="bad">{err}</Alert>}
      {fresh && <div className="mt"><Alert tone="warn">Copie agora: por segurança o link completo <b>não poderá ser exibido novamente</b> (só o hash fica guardado).</Alert>
        <div className="linkbox">{fresh.url}</div><div className="row mt"><CopyButton text={fresh.url} label="Copiar link" /></div>
        <p className="small muted">Modo local: o link só abre neste mesmo navegador (pendência P-01).</p></div>}
    </div>
    <div className="card"><h2>Links emitidos</h2>
      {links.length === 0 ? <Empty>Nenhum link.</Empty> : <div className="tablewrap"><table><thead><tr><th>Criado</th><th>Expira</th><th>Último acesso</th><th>Situação</th><th /></tr></thead><tbody>
        {links.map((l) => <tr key={l.id}><td>{formatDateTime(l.createdAt)}</td><td>{formatDateTime(l.expiresAt)}</td><td>{formatDateTime(l.lastUsedAt)}</td>
          <td>{l.revokedAt ? <Badge tone="bad">revogado</Badge> : linkIsActive(l) ? <Badge tone="ok">ativo</Badge> : <Badge tone="warn">expirado</Badge>}</td>
          <td className="right">{linkIsActive(l) && <button className="danger small" onClick={() => { if (confirm('Revogar este link agora?')) pro.revokeLink(l.id) }}>Revogar</button>}</td></tr>)}</tbody></table></div>}
      <p className="small muted mb0">Tentativas de acesso com link inexistente nesta instalação: {s.failedAccesses}.</p>
    </div></>
}

function Audit({ assessmentId }: { assessmentId: string }) {
  const s = useStore()
  const ids = new Set([assessmentId, ...s.links.filter((l) => l.assessmentId === assessmentId).map((l) => l.id), ...s.sessions.filter((x) => x.assessmentId === assessmentId).map((x) => x.id)])
  const ev = s.audit.filter((e) => (e.entityId && ids.has(e.entityId)) || e.metadata.assessment_id === assessmentId)
  return <div className="card"><h2>Histórico de eventos</h2><p className="small muted">Somente metadados (quem, quando, o quê). O conteúdo clínico das respostas não é copiado para o histórico.</p>
    {ev.length === 0 ? <Empty>Sem eventos.</Empty> : <div className="tablewrap"><table><thead><tr><th>Quando</th><th>Evento</th><th>Detalhes</th></tr></thead><tbody>
      {ev.map((e) => <tr key={e.id}><td>{formatDateTime(e.createdAt)}</td><td>{e.action}</td><td className="small">{Object.entries(e.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') || '—'}</td></tr>)}</tbody></table></div>}</div>
}
