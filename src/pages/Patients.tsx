import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TARGET_LABEL, formatDate } from '../domain/labels'
import { pro, useStore } from '../data/store'
import type { Patient } from '../domain/types'
import { Alert, Empty, Field, StatusBadge } from '../ui/common'

export function Patients() {
  const s = useStore()
  const nav = useNavigate()
  const [name, setName] = useState(''); const [birth, setBirth] = useState(''); const [type, setType] = useState<Patient['patientType']>('adult'); const [err, setErr] = useState('')
  return (
    <>
      <h1>Pacientes</h1>
      <div className="grid g2">
        <div className="card"><h2>Novo paciente</h2>
          <Alert tone="info">Nesta versão use apenas nomes fictícios ou iniciais.</Alert>
          <form onSubmit={(e) => { e.preventDefault(); try { const id = pro.addPatient({ displayName: name, birthDate: birth, patientType: type }); nav(`/pacientes/${id}`) } catch (x) { setErr((x as Error).message) } }}>
            <Field label="Nome" id="pn"><input id="pn" type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Data de nascimento" hint="(opcional)" id="pb"><input id="pb" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></Field>
            <Field label="Público" id="pt"><select id="pt" value={type} onChange={(e) => setType(e.target.value as Patient['patientType'])}><option value="adult">Adulto</option><option value="child">Criança</option><option value="unspecified">Não especificado</option></select></Field>
            {err && <Alert tone="bad">{err}</Alert>}<button type="submit">Cadastrar</button>
          </form></div>
        <div className="card"><h2>Lista ({s.patients.length})</h2>
          {s.patients.length === 0 ? <Empty>Nenhum paciente cadastrado.</Empty> : <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{s.patients.map((p) => <li key={p.id}><Link to={`/pacientes/${p.id}`}>{p.displayName}</Link> <span className="muted small">— {TARGET_LABEL[p.patientType]}</span></li>)}</ul>}
        </div>
      </div>
    </>
  )
}

export function PatientDetail() {
  const { id } = useParams()
  const s = useStore()
  const p = s.patients.find((x) => x.id === id)
  if (!p) return <p>Paciente não encontrado. <Link to="/pacientes">Voltar</Link></p>
  const list = s.assessments.filter((a) => a.patientId === p.id).sort((a, b) => a.startDate.localeCompare(b.startDate))
  return (
    <>
      <p><Link to="/pacientes">← Pacientes</Link></p>
      <div className="row between"><div><h1>{p.displayName}</h1><p className="muted">{TARGET_LABEL[p.patientType]}{p.birthDate && ` · nascimento ${formatDate(p.birthDate)}`}</p></div>
        <div className="row"><Link className="btn" to={`/avaliacoes/nova?paciente=${p.id}`}>Nova avaliação</Link>
          {list.length >= 2 && <Link className="btn secondary" to={`/comparar/${p.id}`}>Comparar avaliações</Link>}</div></div>
      <div className="card"><h2>Avaliações</h2>
        {list.length === 0 ? <Empty>Sem avaliações.</Empty> : <div className="tablewrap"><table><thead><tr><th>Título</th><th>Período</th><th>Situação</th></tr></thead>
          <tbody>{list.map((a) => <tr key={a.id}><td><Link to={`/avaliacoes/${a.id}`}>{a.title}</Link></td><td>{formatDate(a.startDate)} – {formatDate(a.endDate)}</td><td><StatusBadge status={a.status} /></td></tr>)}</tbody></table></div>}
      </div>
    </>
  )
}
