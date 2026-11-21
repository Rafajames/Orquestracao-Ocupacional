import { recordTotal } from '../domain/analytics'
import { DISCOMFORT_LABEL, FREQ_LABEL, SATISFACTION_LABEL, STATUS_LABEL, formatMinutes } from '../domain/labels'
import type { Discomfort, FieldConfig, FrequencyUnit, OccupationSnapshot, RecordStatus, Satisfaction } from '../domain/types'
import { hasErrors, validateRecord } from '../domain/validation'
import type { RecordInput } from '../data/store'
import { DurationInput } from '../ui/common'

export function emptyRecord(occupationId: string, recordDate: string | null): RecordInput {
  return {
    occupationId, recordDate, status: 'not_answered', durationMinutes: null, occurrenceCount: null, directTotalMinutes: null,
    frequencyValue: null, frequencyUnit: null, satisfaction: null, discomfort: [], startTime: null, endTime: null, notes: '',
  }
}
export function isEmptyRecord(r: RecordInput): boolean {
  return r.status === 'not_answered' && r.durationMinutes === null && r.occurrenceCount === null && r.directTotalMinutes === null &&
    r.frequencyValue === null && r.satisfaction === null && r.discomfort.length === 0 && !r.startTime && !r.endTime && !r.notes
}

interface Props {
  occ: OccupationSnapshot
  cfg: FieldConfig
  value: RecordInput
  onChange: (next: RecordInput) => void
  dayMode?: boolean
  idPrefix: string
}

const STATES: RecordStatus[] = ['performed', 'not_performed', 'not_applicable', 'unknown']

export function RecordEditor({ occ, cfg, value: v, onChange, dayMode, idPrefix }: Props) {
  const f = cfg.fields
  const statusOn = f.status.enabled
  const showData = statusOn ? v.status === 'performed' : true

  const update = (patch: Partial<RecordInput>) => {
    let next: RecordInput = { ...v, ...patch }
    const touchesData = Object.keys(patch).some((k) => k !== 'status' && k !== 'notes')
    if (!statusOn && touchesData && next.status === 'not_answered') next = { ...next, status: 'performed' }
    if (patch.status && patch.status !== 'performed') {
      next = { ...next, durationMinutes: null, occurrenceCount: null, directTotalMinutes: null, frequencyValue: null, frequencyUnit: null, satisfaction: null, discomfort: [], startTime: null, endTime: null }
    }
    onChange(next)
  }
  const label = (s: RecordStatus) => (dayMode ? ({ performed: 'Realizou', not_performed: 'Não realizou', not_applicable: 'Não se aplica', unknown: 'Não sabe informar', not_answered: '' }[s]) : STATUS_LABEL[s])
  const issues = validateRecord(v, cfg)
  const total = recordTotal(v)

  const setDiscomfort = (d: Discomfort, on: boolean) => {
    if (!cfg.discomfortMultiple) return update({ discomfort: on ? [d] : [] })
    if (d === 'none') return update({ discomfort: on ? ['none'] : [] })
    const rest = v.discomfort.filter((x) => x !== 'none' && x !== d)
    update({ discomfort: on ? [...rest, d] : rest })
  }

  return (
    <div>
      {statusOn && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr" style={{ position: 'absolute', left: -999 }}>{`${occ.name}: situação`}</legend>
          <div className="choices" role="radiogroup" aria-label={`${occ.name}: situação`}>
            {STATES.map((s) => (
              <label className="choice" key={s}>
                <input type="radio" name={`${idPrefix}-st`} checked={v.status === s} onChange={() => update({ status: s })} />
                {label(s)}
              </label>
            ))}
            {v.status !== 'not_answered' && <button type="button" className="ghost small" onClick={() => onChange(emptyRecord(v.occupationId, v.recordDate))}>Limpar</button>}
          </div>
        </fieldset>
      )}

      {showData && (
        <div className="grid g2 mt">
          {f.duration.enabled && (
            <div className="field"><label htmlFor={`${idPrefix}-dur`}>{dayMode ? 'Tempo de cada vez' : 'Tempo de cada vez'}{f.duration.required && ' *'}</label>
              <DurationInput id={`${idPrefix}-dur`} label="Duração por vez" value={v.durationMinutes} onChange={(x) => update({ durationMinutes: x })} /></div>
          )}
          {f.occurrences.enabled && (
            <div className="field"><label htmlFor={`${idPrefix}-occ`}>{dayMode ? 'Quantas vezes neste dia' : 'Quantas vezes no período'}{f.occurrences.required && ' *'}</label>
              <input id={`${idPrefix}-occ`} type="number" inputMode="decimal" min={0} step="any" value={v.occurrenceCount ?? ''} onChange={(e) => update({ occurrenceCount: e.target.value === '' ? null : Number(e.target.value) })} /></div>
          )}
          {f.direct_total.enabled && (
            <div className="field"><label htmlFor={`${idPrefix}-tot`}>{dayMode ? 'Tempo total neste dia' : 'Tempo total no período'}{f.direct_total.required && ' *'} <span className="hint">(se já souber o total)</span></label>
              <DurationInput id={`${idPrefix}-tot`} label="Tempo total" value={v.directTotalMinutes} onChange={(x) => update({ directTotalMinutes: x })} /></div>
          )}
          {f.frequency.enabled && (
            <div className="field"><label htmlFor={`${idPrefix}-fq`}>Frequência habitual{f.frequency.required && ' *'}</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id={`${idPrefix}-fq`} type="number" inputMode="decimal" min={0} step="any" style={{ maxWidth: 90 }} aria-label="Quantas vezes" value={v.frequencyValue ?? ''} onChange={(e) => update({ frequencyValue: e.target.value === '' ? null : Number(e.target.value), frequencyUnit: v.frequencyUnit ?? (e.target.value === '' ? null : 'week') })} />
                <select aria-label="Unidade da frequência" value={v.frequencyUnit ?? ''} onChange={(e) => update({ frequencyUnit: (e.target.value || null) as FrequencyUnit | null })}>
                  <option value="">unidade…</option>
                  {(Object.keys(FREQ_LABEL) as FrequencyUnit[]).map((u) => <option key={u} value={u}>{FREQ_LABEL[u]}</option>)}
                </select>
              </div></div>
          )}
          {f.start_end_time.enabled && (
            <div className="field"><label>Horário de início e fim</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="time" aria-label="Início" value={v.startTime ?? ''} onChange={(e) => update({ startTime: e.target.value || null })} />
                <input type="time" aria-label="Fim" value={v.endTime ?? ''} onChange={(e) => update({ endTime: e.target.value || null })} /></div></div>
          )}
        </div>
      )}
      {showData && (f.duration.enabled || f.direct_total.enabled) && total.minutes !== null && (
        <p className="small muted" aria-live="polite">Total calculado: <b>{formatMinutes(total.minutes)}</b>{total.basis === 'duration_x_count' && ' (tempo de cada vez × quantidade de vezes)'}</p>
      )}

      {showData && f.satisfaction.enabled && (
        <div className="field mt"><label id={`${idPrefix}-sl`}>Satisfação com a atividade{f.satisfaction.required && ' *'}</label>
          <div className="choices" role="radiogroup" aria-labelledby={`${idPrefix}-sl`}>
            {(['satisfied', 'dissatisfied'] as Satisfaction[]).map((s) => (
              <label className="choice" key={s}><input type="radio" name={`${idPrefix}-sat`} checked={v.satisfaction === s} onChange={() => update({ satisfaction: s })} />{SATISFACTION_LABEL[s]}</label>
            ))}
            {v.satisfaction && <button type="button" className="ghost small" onClick={() => update({ satisfaction: null })}>Limpar</button>}
          </div></div>
      )}
      {showData && f.discomfort.enabled && (
        <div className="field"><label id={`${idPrefix}-dl`}>Desconforto{f.discomfort.required && ' *'} <span className="hint">{cfg.discomfortMultiple ? '(pode marcar mais de um tipo)' : '(escolha um)'}</span></label>
          <div className="choices" role="group" aria-labelledby={`${idPrefix}-dl`}>
            {(['physical', 'mental', 'sensory', 'none'] as Discomfort[]).map((d) => (
              <label className="choice" key={d}>
                <input type={cfg.discomfortMultiple ? 'checkbox' : 'radio'} name={`${idPrefix}-dis`} checked={v.discomfort.includes(d)} onChange={(e) => setDiscomfort(d, e.target.checked)} />
                {DISCOMFORT_LABEL[d]}
              </label>
            ))}
            {v.discomfort.length > 0 && <button type="button" className="ghost small" onClick={() => update({ discomfort: [] })}>Limpar</button>}
          </div></div>
      )}
      {f.notes.enabled && (v.status !== 'not_answered' || !statusOn) && (
        <div className="field"><label htmlFor={`${idPrefix}-nt`}>Observação</label>
          <textarea id={`${idPrefix}-nt`} style={{ minHeight: 60 }} maxLength={2000} value={v.notes} onChange={(e) => update({ notes: e.target.value })} /></div>
      )}
      {issues.map((i) => <div key={i.code} className={`alert ${i.level === 'error' ? 'bad' : 'warn'}`} role={i.level === 'error' ? 'alert' : undefined}>{i.message}</div>)}
    </div>
  )
}
export { hasErrors }
