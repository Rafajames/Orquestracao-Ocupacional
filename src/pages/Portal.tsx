// Portal do respondente: acesso por link individual, sem conta (doc 01 §4.2).
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { analyze } from '../domain/analytics'
import { GUARDIAN_MODE_LABEL, RESPONDENT_LABEL, SOURCE_LABEL, formatDate, formatMinutes } from '../domain/labels'
import type { GuardianMode, RespondentType, SourceOfInformation } from '../domain/types'
import { portalApi, type PortalAssessment, type PortalError, type PortalOpen, type RecordInput } from '../data/store'
import { ResponseForm, reviewIssues } from '../components/ResponseForm'
import { Alert, Field } from '../ui/common'
import type { ActivityRecord } from '../domain/types'

const ERR: Record<PortalError, string> = {
  invalid_link: 'Este link não é válido. Confira se copiou o endereço completo ou peça um novo link ao profissional.',
  revoked_link: 'Este link foi cancelado pelo profissional. Peça um novo link.',
  expired_link: 'Este link expirou. Peça um novo link ao profissional.',
  not_available: 'Esta avaliação não está disponível para resposta no momento.',
  privacy_required: 'É preciso aceitar o aviso de privacidade para continuar.',
  invalid_session: 'Não foi possível continuar esta resposta. Recarregue a página.',
  invalid_record: 'Alguma resposta está inválida.',
}
type Step = 'intro' | 'form' | 'review' | 'done'

function Frame({ children }: { children: React.ReactNode }) {
  return <><a className="skip" href="#main">Ir para o conteúdo</a><header className="topbar"><div className="in"><span className="brand">Orquestração Ocupacional</span></div></header>
    <main id="main" className="container" style={{ maxWidth: 860 }}>{children}</main></>
}

export function Portal() {
  const { token = '' } = useParams()
  const [data, setData] = useState<PortalOpen | null>(null)
  useEffect(() => { void portalApi.open(token).then(setData) }, [token])
  if (!data) return <Frame><p role="status">Carregando…</p></Frame>
  if ('error' in data) return <Frame><div className="center"><Alert tone="bad">{ERR[data.error]}</Alert></div></Frame>
  if ('submitted' in data) return <Frame><div className="center card"><h1>Respostas já enviadas</h1><p>As respostas de “{data.title}” já foram enviadas. Obrigado! Se precisar corrigir algo, fale com o profissional.</p></div></Frame>
  return <Frame><Flow token={token} a={data.assessment} sessionInit={data.session} recordsInit={data.records} /></Frame>
}

function Flow({ token, a, sessionInit, recordsInit }: { token: string; a: PortalAssessment; sessionInit: PortalOpenSession; recordsInit: ActivityRecord[] }) {
  const [step, setStep] = useState<Step>('intro')
  const [sessionId, setSessionId] = useState<string | null>(sessionInit?.id ?? null)
  const [type, setType] = useState<RespondentType>(sessionInit?.respondentType ?? a.expectedRespondent)
  const [name, setName] = useState(sessionInit?.respondentName ?? ''); const [rel, setRel] = useState(sessionInit?.relationshipToPatient ?? '')
  const [gm, setGm] = useState<GuardianMode | ''>(sessionInit?.guardianMode ?? '')
  const [source, setSource] = useState<SourceOfInformation>(sessionInit?.sourceOfInformation ?? a.expectedSource)
  const [ok, setOk] = useState(false); const [err, setErr] = useState('')
  const [recs, setRecs] = useState<RecordInput[]>([]); const [notes, setNotes] = useState(sessionInit?.respondentNotes ?? '')
  const needsRelation = type === 'guardian' || type === 'joint'

  const persist = useMemo(() => async (r: RecordInput[], n: string) => {
    if (!sessionId) return { ok: false as const, message: 'Sessão não iniciada.' }
    const res = await portalApi.saveRecords(token, sessionId, r, n)
    return 'error' in res ? { ok: false as const, message: res.details ?? ERR[res.error] } : { ok: true as const }
  }, [token, sessionId])

  const begin = async () => {
    setErr('')
    if (!ok) return setErr('Marque que leu o aviso de privacidade para continuar.')
    if (!name.trim()) return setErr('Informe seu nome (ou como prefere ser identificado).')
    if (needsRelation && !rel.trim()) return setErr('Informe sua relação com o paciente (por exemplo: mãe, pai, cuidador).')
    if (needsRelation && a.targetType === 'child' && !gm) return setErr('Informe como a resposta está sendo preenchida.')
    const r = await portalApi.startSession(token, { respondentType: type, name, relationship: rel, guardianMode: gm || null, source, privacyAccepted: true })
    if ('error' in r) return setErr(ERR[r.error])
    setSessionId(r.sessionId); setStep('form')
  }

  if (step === 'intro') return (
    <div className="center card">
      <h1>{a.title}</h1>
      <p>Período a responder: <b>{formatDate(a.startDate)} a {formatDate(a.endDate)}</b>.</p>
      {a.instructions && <p style={{ whiteSpace: 'pre-wrap' }}>{a.instructions}</p>}
      <Alert tone="info"><b>Aviso de privacidade (rascunho).</b> As informações que você registrar serão recebidas pelo profissional responsável, para organizar sua rotina e atividades. Não coloque dados desnecessários (como documentos). O texto definitivo de privacidade e consentimento ainda precisa de revisão jurídica.</Alert>
      <h2>Quem está respondendo?</h2>
      <Field label="Quem está preenchendo agora" id="rt"><select id="rt" value={type} onChange={(e) => setType(e.target.value as RespondentType)}>{(['patient', 'guardian', 'joint', 'professional'] as RespondentType[]).map((k) => <option key={k} value={k}>{RESPONDENT_LABEL[k]}</option>)}</select></Field>
      <Field label="Seu nome" id="rn"><input id="rn" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {needsRelation && <Field label="Sua relação com o paciente" hint="(ex.: mãe, pai, cuidador)" id="rr"><input id="rr" type="text" value={rel} onChange={(e) => setRel(e.target.value)} /></Field>}
      {needsRelation && a.targetType === 'child' && <Field label="Como está sendo respondido" id="gm"><select id="gm" value={gm} onChange={(e) => setGm(e.target.value as GuardianMode)}><option value="">Selecione…</option>{(Object.keys(GUARDIAN_MODE_LABEL) as GuardianMode[]).map((k) => <option key={k} value={k}>{GUARDIAN_MODE_LABEL[k]}</option>)}</select></Field>}
      <Field label="De onde vêm as informações" id="so"><select id="so" value={source} onChange={(e) => setSource(e.target.value as SourceOfInformation)}>{(Object.keys(SOURCE_LABEL) as SourceOfInformation[]).map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}</select></Field>
      <label className="choice" style={{ borderRadius: 8, marginBottom: '.8rem' }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />Li o aviso de privacidade e concordo em continuar.</label>
      {err && <Alert tone="bad">{err}</Alert>}
      <button onClick={() => { void begin() }}>{sessionId ? 'Continuar' : 'Começar'}</button>
    </div>
  )

  if (step === 'form') return <>
    <h1>{a.title}</h1>
    <ResponseForm assessment={a} initial={recordsInit} initialNotes={notes} persist={persist} onReview={(r, n) => { setRecs(r); setNotes(n); setStep('review') }} />
  </>

  if (step === 'review') {
    const r = reviewIssues(a, recs)
    const an = analyze(a, recs.map((x) => ({ ...x, id: '', assessmentId: '', sessionId: sessionId ?? '', entryMode: 'by_activity' as const, updatedAt: '' })))
    const submit = async () => {
      if (!sessionId) return
      const res = await portalApi.submit(token, sessionId)
      if ('error' in res) setErr(ERR[res.error]); else setStep('done')
    }
    return (
      <div className="center card">
        <h1>Revisar antes de enviar</h1>
        <p>{a.catalogSnapshot.length - r.unanswered.length} de {a.catalogSnapshot.length} atividades respondidas.</p>
        <p>Tempo registrado no total: <b>{formatMinutes(an.totalMinutes || null)}</b></p>
        {r.errors.map((e, i) => <Alert key={i} tone="bad">{e}</Alert>)}
        {an.alerts.filter((x) => x.level === 'warning').map((x, i) => <Alert key={i} tone="warn">{x.message}</Alert>)}
        {r.missing.length > 0 && <Alert tone="warn">Há campos obrigatórios sem resposta em {r.missing.length} atividade(s): {r.missing.slice(0, 5).map((m) => m.name).join('; ')}{r.missing.length > 5 ? '…' : ''}. Você pode enviar assim mesmo ou voltar para completar.</Alert>}
        {r.unanswered.length > 0 && <details><summary>{r.unanswered.length} atividade(s) sem resposta</summary><ul>{r.unanswered.map((n) => <li key={n}>{n}</li>)}</ul></details>}
        {err && <Alert tone="bad">{err}</Alert>}
        <p className="small muted">Depois de enviar, não será possível alterar. Se algo estiver errado, fale com o profissional.</p>
        <div className="row"><button className="secondary" onClick={() => setStep('form')}>Voltar e editar</button><button disabled={r.errors.length > 0} onClick={() => { void submit() }}>Enviar respostas</button></div>
      </div>
    )
  }
  return <div className="center card"><h1>Respostas enviadas ✓</h1><p>Obrigado! O profissional já pode ver o que você registrou. Você pode fechar esta página.</p></div>
}
type PortalOpenSession = Extract<PortalOpen, { assessment: PortalAssessment }>['session']
