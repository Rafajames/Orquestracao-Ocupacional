// Formulário de resposta compartilhado (portal do respondente e profissional em entrevista).
// "Por atividade" e "Rotina por dia" operam sobre a MESMA coleção de registros (ADR-004).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recordTotal } from '../domain/analytics'
import { periodDates } from '../domain/catalog'
import { FORMAT_LABEL, formatDate, formatMinutes, weekdayName } from '../domain/labels'
import type { ActivityRecord, FieldConfig, FillFormat, OccupationSnapshot, TargetType } from '../domain/types'
import { hasErrors, missingRequired, validateRecord } from '../domain/validation'
import type { RecordInput } from '../data/store'
import { Alert, Field } from '../ui/common'
import { RecordEditor, emptyRecord, isEmptyRecord } from './RecordEditor'

export interface FormAssessment {
  title: string; targetType: TargetType; fillFormats: FillFormat[]; startDate: string; endDate: string
  catalogSnapshot: OccupationSnapshot[]; fieldSnapshot: FieldConfig; instructions: string
}
type SaveResult = { ok: true } | { ok: false; message: string }
const keyOf = (occ: string, date: string | null) => `${occ}|${date ?? ''}`

export function toInput(r: ActivityRecord): RecordInput {
  const { id: _i, assessmentId: _a, sessionId: _s, updatedAt: _u, ...rest } = r
  return rest
}

export function reviewIssues(a: FormAssessment, recs: RecordInput[]) {
  const errors: string[] = []
  const missing: { name: string; fields: string[] }[] = []
  const byOcc = new Map<string, RecordInput[]>()
  for (const r of recs) byOcc.set(r.occupationId, [...(byOcc.get(r.occupationId) ?? []), r])
  const name = (id: string) => a.catalogSnapshot.find((o) => o.occupationId === id)?.name ?? id
  for (const r of recs) {
    const bad = validateRecord(r, a.fieldSnapshot).filter((i) => i.level === 'error')
    for (const b of bad) errors.push(`${name(r.occupationId)}${r.recordDate ? ` (${formatDate(r.recordDate)})` : ''}: ${b.message}`)
    const m = missingRequired(r, a.fieldSnapshot)
    if (m.length) missing.push({ name: name(r.occupationId), fields: m })
  }
  const unanswered = a.catalogSnapshot.filter((o) => !(byOcc.get(o.occupationId) ?? []).some((r) => r.status !== 'not_answered')).map((o) => o.name)
  return { errors, missing, unanswered }
}

export function ResponseForm({ assessment: a, initial, initialNotes, persist, onReview, reviewLabel = 'Revisar e enviar' }: {
  assessment: FormAssessment; initial: ActivityRecord[]; initialNotes: string
  persist: (records: RecordInput[], notes: string) => Promise<SaveResult>; onReview: (records: RecordInput[], notes: string) => void; reviewLabel?: string
}) {
  const cfg = a.fieldSnapshot
  const [recs, setRecs] = useState<Record<string, RecordInput>>(() => Object.fromEntries(initial.map((r) => [keyOf(r.occupationId, r.recordDate), toInput(r)])))
  const [notes, setNotes] = useState(initialNotes)
  const [tab, setTab] = useState<FillFormat>(a.fillFormats[0])
  const days = useMemo(() => periodDates(a.startDate, a.endDate), [a.startDate, a.endDate])
  const [day, setDay] = useState(days[0])
  const [q, setQ] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const dirty = useRef(new Set<string>())
  const notesDirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef({ recs, notes }); latest.current = { recs, notes }

  const flush = useCallback(async (): Promise<boolean> => {
    const { recs: cur, notes: n } = latest.current
    const keys = [...dirty.current]
    const toSend = keys.map((k) => cur[k]).filter((r): r is RecordInput => !!r && !hasErrors(validateRecord(r, cfg)))
    if (!toSend.length && !notesDirty.current) return true
    setSaveMsg('Salvando…')
    const res = await persist(toSend, n)
    if (res.ok) {
      for (const r of toSend) dirty.current.delete(keyOf(r.occupationId, r.recordDate))
      notesDirty.current = false
      setSaveErr(''); setSaveMsg(`Salvo automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
      return true
    }
    setSaveMsg(''); setSaveErr(res.message)
    return false
  }, [persist, cfg])

  useEffect(() => () => window.clearTimeout(timer.current), [])
  const schedule = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void flush() }, 700) }

  const setRec = (r: RecordInput) => {
    const k = keyOf(r.occupationId, r.recordDate)
    setRecs((prev) => {
      const next = { ...prev }
      if (isEmptyRecord(r) && !prev[k]) delete next[k]; else next[k] = r
      return next
    })
    dirty.current.add(k); schedule()
  }
  const getRec = (occ: string, date: string | null) => recs[keyOf(occ, date)] ?? emptyRecord(occ, date)
  const answered = (occ: string) => Object.values(recs).some((r) => r.occupationId === occ && r.status !== 'not_answered')
  const doneCount = a.catalogSnapshot.filter((o) => answered(o.occupationId)).length
  const total = a.catalogSnapshot.length

  const visible = a.catalogSnapshot.filter((o) => (!q || o.name.toLowerCase().includes(q.toLowerCase())) && (!onlyPending || !answered(o.occupationId)))
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; items: OccupationSnapshot[] }>()
    for (const o of visible) {
      const k = `${o.areaCode}|${o.subareaCode ?? ''}`
      const title = o.subareaName ? `${o.areaName} · ${o.subareaName}` : o.areaName
      if (!m.has(k)) m.set(k, { title, items: [] })
      m.get(k)!.items.push(o)
    }
    return [...m.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((o) => o.occupationId).join(',')])

  const dayTotal = (d: string) => Object.values(recs).filter((r) => r.recordDate === d).reduce((s, r) => s + (recordTotal(r).minutes ?? 0), 0)
  const clean = () => Object.values(recs).filter((r) => !isEmptyRecord(r))
  const go = async () => {
    window.clearTimeout(timer.current)
    const ok = await flush()
    if (ok) onReview(clean(), notes)
  }

  const activityCard = (o: OccupationSnapshot, date: string | null) => {
    const r = getRec(o.occupationId, date)
    const cls = r.status === 'performed' ? 'done' : r.status === 'not_answered' ? '' : 'no'
    return (
      <div className={`act ${cls}`} key={o.occupationId + (date ?? '')}>
        <h3>{o.name}{o.origin === 'custom' && <span className="badge info" style={{ marginLeft: 8 }}>personalizada</span>}</h3>
        <RecordEditor occ={o} cfg={cfg} value={r} onChange={setRec} dayMode={date !== null} idPrefix={`${o.occupationId}-${date ?? 'p'}`} />
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <div className="row between"><b>{doneCount} de {total} atividades respondidas</b><span className="small muted" aria-live="polite">{saveMsg}</span></div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Progresso"><i style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} /></div>
        <p className="small muted mb0">Período: {formatDate(a.startDate)} a {formatDate(a.endDate)}. Suas respostas são salvas automaticamente e você pode voltar depois pelo mesmo link.</p>
        {saveErr && <Alert tone="bad">Não foi possível salvar: {saveErr}</Alert>}
      </div>

      {a.fillFormats.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Formato de preenchimento">
          {a.fillFormats.map((f) => <button key={f} role="tab" aria-selected={tab === f} onClick={() => setTab(f)}>{FORMAT_LABEL[f]}</button>)}
        </div>
      )}
      {a.fillFormats.length > 1 && <Alert>As duas formas de preencher usam os mesmos registros: o que você informar em uma aparece na outra, sem contar em dobro.</Alert>}

      <div className="row" style={{ marginBottom: '.6rem' }}>
        <div style={{ flex: '1 1 220px' }}><label className="hint" htmlFor="busca">Buscar atividade</label><input id="busca" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite parte do nome" /></div>
        <label className="choice" style={{ marginTop: 18 }}><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />Só as que faltam</label>
      </div>

      {tab === 'weekly_routine' && (
        <div className="card">
          <h2>Escolha o dia</h2>
          <div className="daychips" role="group" aria-label="Dias do período">
            {days.map((d) => (
              <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)}>
                <span>{weekdayName(d).slice(0, 3)}</span><small>{formatDate(d).slice(0, 5)}</small>
                <small>{dayTotal(d) ? formatMinutes(dayTotal(d)) : '—'}</small>
              </button>
            ))}
          </div>
          <p className="muted small mb0">{weekdayName(day)}, {formatDate(day)} — total registrado no dia: <b>{formatMinutes(dayTotal(day) || null)}</b></p>
          {dayTotal(day) > 1440 && <Alert tone="warn">O total deste dia passa de 24 horas (1.440 min). Confira os valores — nada foi alterado.</Alert>}
        </div>
      )}

      {groups.length === 0 && <p className="muted">Nenhuma atividade encontrada.</p>}
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <div className="areahead">{g.title}</div>
          {g.items.map((o) => activityCard(o, tab === 'weekly_routine' ? day : null))}
        </section>
      ))}

      <div className="card mt">
        <Field label="Observações gerais" hint="(opcional)" id="obs-geral">
          <textarea id="obs-geral" maxLength={4000} value={notes} onChange={(e) => { setNotes(e.target.value); notesDirty.current = true; schedule() }} />
        </Field>
      </div>
      <div className="sticky-actions">
        <span className="small muted">{doneCount < total ? `${total - doneCount} atividade(s) sem resposta — você pode revisar mesmo assim.` : 'Tudo respondido.'}</span>
        <div className="row"><button className="secondary" type="button" onClick={() => { window.clearTimeout(timer.current); void flush() }}>Salvar agora</button><button type="button" onClick={() => { void go() }}>{reviewLabel}</button></div>
      </div>
    </div>
  )
}
