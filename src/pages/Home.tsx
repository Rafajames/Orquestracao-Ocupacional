import { Link } from 'react-router-dom'
import { ASSESSMENT_STATUS_LABEL, formatDate } from '../domain/labels'
import { linkIsActive, useStore } from '../data/store'
import { Empty, StatusBadge, Badge } from '../ui/common'

export function Home() {
  const s = useStore()
  const sorted = [...s.assessments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const waiting = s.assessments.filter((a) => a.status === 'submitted' || a.status === 'under_review').length
  return (
    <>
      <div className="row between"><div><h1>Início</h1><p className="muted">Avaliações, respostas recebidas e relatórios.</p></div>
        <Link className="btn" to="/avaliacoes/nova">Nova avaliação</Link></div>
      <div className="grid g4" style={{ marginBottom: '1rem' }}>
        <div className="kpi"><b>{s.patients.length}</b><span>pacientes</span></div>
        <div className="kpi"><b>{s.assessments.length}</b><span>avaliações</span></div>
        <div className="kpi"><b>{waiting}</b><span>respostas para revisar</span></div>
        <div className="kpi"><b>{s.assessments.filter((a) => a.status === 'sent' || a.status === 'in_progress').length}</b><span>aguardando respondente</span></div>
      </div>
      <div className="card">
        <h2>Avaliações</h2>
        {sorted.length === 0 ? <Empty>Nenhuma avaliação ainda. Cadastre um paciente e crie a primeira avaliação.</Empty> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Título</th><th>Paciente</th><th>Período</th><th>Situação</th><th>Link</th></tr></thead>
            <tbody>{sorted.map((a) => {
              const p = s.patients.find((x) => x.id === a.patientId)
              const links = s.links.filter((l) => l.assessmentId === a.id)
              const active = links.some(linkIsActive)
              const waiting = (a.status === 'sent' || a.status === 'in_progress') && links.length > 0 && !active
              return <tr key={a.id}>
                <td><Link to={`/avaliacoes/${a.id}`}>{a.title}</Link></td><td>{p?.displayName ?? '—'}</td>
                <td>{formatDate(a.startDate)} – {formatDate(a.endDate)}</td>
                <td><StatusBadge status={a.status} /></td>
                <td>{waiting ? <Badge tone="bad">sem link ativo</Badge> : active ? <Badge tone="ok">ativo</Badge> : <span className="muted">—</span>}</td>
              </tr>
            })}</tbody></table></div>)}
        <p className="small muted mb0">Situações possíveis: {Object.values(ASSESSMENT_STATUS_LABEL).join(', ')}.</p>
      </div>
    </>
  )
}
