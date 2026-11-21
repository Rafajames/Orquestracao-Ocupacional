import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FIELD_LABEL, FORMAT_LABEL, RESPONDENT_LABEL, SOURCE_LABEL, TARGET_LABEL } from '../domain/labels'
import { defaultFieldConfig, periodDates } from '../domain/catalog'
import type { FieldConfig, FieldKey, FillFormat, RespondentType, SourceOfInformation, TargetType } from '../domain/types'
import { AREAS, activeOccupations, pro, useStore } from '../data/store'
import { Alert, Field } from '../ui/common'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }

export function NewAssessment() {
  const s = useStore(); const nav = useNavigate(); const [qs] = useSearchParams()
  const [patientId, setPatientId] = useState(qs.get('paciente') ?? '')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState<TargetType>('adult')
  const [formats, setFormats] = useState<FillFormat[]>(['by_activity'])
  const today = iso(new Date())
  const [start, setStart] = useState(today); const [end, setEnd] = useState(addDays(today, 6))
  const [respondent, setRespondent] = useState<RespondentType>('patient'); const [source, setSource] = useState<SourceOfInformation>('self_report')
  const [instructions, setInstructions] = useState('Responda pensando no período indicado. Não há respostas certas ou erradas. Se não souber informar, escolha essa opção.')
  const [cfg, setCfg] = useState<FieldConfig>(defaultFieldConfig())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saveModel, setSaveModel] = useState(''); const [err, setErr] = useState('')
  const occ = activeOccupations(s)
  const top = AREAS.filter((a) => !a.parentCode)
  const days = useMemo(() => (start && end && end >= start ? periodDates(start, end, 63).length : 0), [start, end])

  const applyPatient = (id: string) => { setPatientId(id); const p = s.patients.find((x) => x.id === id); if (p && p.patientType !== 'unspecified') { setTarget(p.patientType); if (p.patientType === 'child') { setRespondent('guardian'); setSource('guardian_report') } } }
  const toggle = (id: string) => setPicked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const setMany = (ids: string[], on: boolean) => setPicked((x) => { const n = new Set(x); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n })
  const setField = (k: FieldKey, patch: Partial<FieldConfig['fields'][FieldKey]>) => setCfg((c) => ({ ...c, fields: { ...c.fields, [k]: { ...c.fields[k], ...patch } } }))
  const useTemplate = (id: string) => { const t = s.templates.find((x) => x.id === id); if (!t) return; setTarget(t.targetType); setFormats(t.formats); setCfg(structuredClone(t.fieldConfig)); setPicked(new Set(t.occupationIds.filter((i) => occ.some((o) => o.id === i)))) }

  const submit = () => {
    try {
      const id = pro.createAssessment({ patientId, title, targetType: target, formats, startDate: start, endDate: end, expectedRespondent: respondent, expectedSource: source, instructions, occupationIds: [...picked], fieldConfig: cfg })
      if (saveModel.trim()) pro.saveTemplate({ name: saveModel.trim(), targetType: target, formats, fieldConfig: cfg, occupationIds: [...picked] })
      nav(`/avaliacoes/${id}`)
    } catch (x) { setErr((x as Error).message) }
  }
  if (!s.patients.length) return <><h1>Nova avaliação</h1><Alert tone="info">Cadastre um paciente antes. <Link to="/pacientes">Ir para Pacientes</Link></Alert></>

  return (
    <>
      <h1>Nova avaliação</h1>
      {s.templates.length > 0 && <div className="card"><Field label="Começar de um modelo" id="tpl"><select id="tpl" defaultValue="" onChange={(e) => useTemplate(e.target.value)}><option value="">(do zero)</option>{s.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div>}
      <div className="card"><h2>1. Quem e quando</h2>
        <div className="grid g2">
          <Field label="Paciente" id="pa"><select id="pa" value={patientId} onChange={(e) => applyPatient(e.target.value)}><option value="">Selecione…</option>{s.patients.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></Field>
          <Field label="Título da avaliação" id="ti"><input id="ti" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Rotina — novembro" /></Field>
          <Field label="Público" id="pu"><select id="pu" value={target} onChange={(e) => setTarget(e.target.value as TargetType)}>{(['adult', 'child'] as TargetType[]).map((t) => <option key={t} value={t}>{TARGET_LABEL[t]}</option>)}</select></Field>
          <div className="grid g2"><Field label="Início" id="di"><input id="di" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="Fim" id="df"><input id="df" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
        </div>
        <p className="small muted">{days ? `${days} dia(s) no período.` : 'A data final deve ser igual ou posterior à inicial.'} O período é livre (1 a 62 dias): não precisa ser uma semana completa.</p>
        <div className="row"><button type="button" className="secondary small" onClick={() => setEnd(addDays(start, 6))}>7 dias</button><button type="button" className="secondary small" onClick={() => setEnd(addDays(start, 13))}>14 dias</button><button type="button" className="secondary small" onClick={() => setEnd(start)}>1 dia</button></div>
      </div>
      <div className="card"><h2>2. Respondente e formato</h2>
        <div className="grid g2">
          <Field label="Quem deve responder" id="re"><select id="re" value={respondent} onChange={(e) => setRespondent(e.target.value as RespondentType)}>{(Object.keys(RESPONDENT_LABEL) as RespondentType[]).map((r) => <option key={r} value={r}>{RESPONDENT_LABEL[r]}</option>)}</select></Field>
          <Field label="Fonte da informação" id="fo"><select id="fo" value={source} onChange={(e) => setSource(e.target.value as SourceOfInformation)}>{(Object.keys(SOURCE_LABEL) as SourceOfInformation[]).map((r) => <option key={r} value={r}>{SOURCE_LABEL[r]}</option>)}</select></Field>
        </div>
        {source === 'professional_observation' && <Alert tone="info">Observação profissional não é equivalente a autorrelato: o relatório mostra a fonte registrada.</Alert>}
        <div className="field"><label id="fmt">Formato de preenchimento</label><div className="choices" role="group" aria-labelledby="fmt">
          {(['by_activity', 'weekly_routine'] as FillFormat[]).map((f) => <label className="choice" key={f}><input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))} />{FORMAT_LABEL[f]}</label>)}</div>
          <p className="small muted">Os dois formatos podem ser usados juntos: ambos gravam nos mesmos registros, sem contar em dobro.</p></div>
        <Field label="Instruções para o respondente" id="in"><textarea id="in" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
      </div>
      <div className="card"><h2>3. Campos disponíveis</h2>
        <p className="small muted">Campos desligados não aparecem no formulário e não contam como “sem resposta” nos relatórios.</p>
        <div className="tablewrap"><table><thead><tr><th>Campo</th><th>Mostrar</th><th>Obrigatório</th></tr></thead><tbody>
          {(Object.keys(cfg.fields) as FieldKey[]).map((k) => <tr key={k}><td>{FIELD_LABEL[k]}</td>
            <td><input type="checkbox" aria-label={`Mostrar ${FIELD_LABEL[k]}`} checked={cfg.fields[k].enabled} onChange={(e) => setField(k, { enabled: e.target.checked, required: e.target.checked ? cfg.fields[k].required : false })} /></td>
            <td><input type="checkbox" aria-label={`${FIELD_LABEL[k]} obrigatório`} disabled={!cfg.fields[k].enabled} checked={cfg.fields[k].required} onChange={(e) => setField(k, { required: e.target.checked })} /></td></tr>)}</tbody></table></div>
        <label className="choice mt"><input type="checkbox" checked={cfg.discomfortMultiple} disabled={!cfg.fields.discomfort.enabled} onChange={(e) => setCfg((c) => ({ ...c, discomfortMultiple: e.target.checked }))} />Permitir mais de um tipo de desconforto</label>
        {cfg.discomfortMultiple && <Alert tone="warn">Ampliação proposta, ainda não validada pela metodologia (pendência P-04). “Sem desconforto” continua exclusivo.</Alert>}
      </div>
      <div className="card"><div className="row between"><h2>4. Atividades ({picked.size} selecionadas)</h2><div className="row"><button className="secondary small" onClick={() => setMany(occ.map((o) => o.id), true)}>Todas</button><button className="secondary small" onClick={() => setPicked(new Set())}>Nenhuma</button></div></div>
        {top.map((a) => { const items = occ.filter((o) => o.areaCode === a.code); if (!items.length) return null; const ids = items.map((o) => o.id); const all = ids.every((i) => picked.has(i))
          return <details key={a.code}><summary>{a.name} — {ids.filter((i) => picked.has(i)).length}/{ids.length}</summary>
            <label className="choice" style={{ margin: '.3rem 0' }}><input type="checkbox" checked={all} onChange={(e) => setMany(ids, e.target.checked)} />Marcar toda a área</label>
            <div className="grid g2">{items.map((o) => { const sub = AREAS.find((x) => x.code === o.subareaCode); return <label key={o.id} className="choice" style={{ borderRadius: 8 }}><input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} />{o.name}{sub && <span className="small muted">({sub.name})</span>}</label> })}</div></details> })}
      </div>
      <div className="card"><Field label="Salvar esta configuração como modelo" hint="(opcional — nome do modelo)" id="sm"><input id="sm" type="text" value={saveModel} onChange={(e) => setSaveModel(e.target.value)} /></Field>
        {err && <Alert tone="bad">{err}</Alert>}
        <p className="small muted">A avaliação guarda uma cópia das atividades e dos campos escolhidos: mudanças futuras no catálogo não a alteram.</p>
        <button onClick={submit}>Criar avaliação (rascunho)</button></div>
    </>
  )
}
