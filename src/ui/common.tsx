import { useState, type ReactNode } from 'react'
import { ASSESSMENT_STATUS_LABEL } from '../domain/labels'
import type { AssessmentStatus } from '../domain/types'

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' | '' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
const TONE: Record<AssessmentStatus, 'ok' | 'warn' | 'bad' | 'info' | ''> = {
  draft: '', sent: 'info', in_progress: 'warn', submitted: 'ok', under_review: 'info', finalized: 'ok', expired: 'bad', cancelled: 'bad',
}
export function StatusBadge({ status }: { status: AssessmentStatus }) {
  return <Badge tone={TONE[status]}>{ASSESSMENT_STATUS_LABEL[status]}</Badge>
}
export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  return <div className={`alert ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>
}
export function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id?: string }) {
  return <div className="field"><label htmlFor={id}>{label} {hint && <span className="hint">{hint}</span>}</label>{children}</div>
}
export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return <button className="secondary small" type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) } catch { window.prompt('Copie o texto:', text) }
  }}>{done ? 'Copiado ✓' : label}</button>
}
export function Empty({ children }: { children: ReactNode }) { return <p className="muted">{children}</p> }

/** Duração estruturada em horas + minutos → minutos inteiros (doc 02 §4). */
export function DurationInput({ value, onChange, id, label }: { value: number | null; onChange: (v: number | null) => void; id?: string; label: string }) {
  const h = value === null ? '' : String(Math.floor(value / 60))
  const m = value === null ? '' : String(value % 60)
  const set = (hh: string, mm: string) => {
    if (hh === '' && mm === '') return onChange(null)
    const total = (Math.max(0, parseInt(hh || '0', 10) || 0)) * 60 + Math.max(0, parseInt(mm || '0', 10) || 0)
    onChange(total)
  }
  return (
    <div className="dur" role="group" aria-label={label}>
      <input id={id} type="number" inputMode="numeric" min={0} aria-label={`${label}: horas`} placeholder="0" value={h} onChange={(e) => set(e.target.value, m)} /><span>h</span>
      <input type="number" inputMode="numeric" min={0} aria-label={`${label}: minutos`} placeholder="0" value={m} onChange={(e) => set(h, e.target.value)} /><span>min</span>
    </div>
  )
}

export function useLocalFlag(): [boolean, (v: boolean) => void] { return useState(false) }
