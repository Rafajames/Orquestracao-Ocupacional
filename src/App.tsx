import { NavLink, Route, Routes, Link } from 'react-router-dom'
import { pro, storageFailed, useStore } from './data/store'
import { Alert } from './ui/common'
import { AssessmentDetail } from './pages/AssessmentDetail'
import { Catalog } from './pages/Catalog'
import { Compare } from './pages/Compare'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { NewAssessment } from './pages/NewAssessment'
import { PatientDetail, Patients } from './pages/Patients'
import { Portal } from './pages/Portal'
import { ProFill } from './pages/ProFill'
import { Report } from './pages/Report'
import { Settings } from './pages/Settings'

function Shell() {
  const s = useStore()
  if (!s.profile) return <Login />
  return (
    <>
      <a className="skip" href="#main">Ir para o conteúdo</a>
      <header className="topbar"><div className="in">
        <Link className="brand" to="/">Orquestração Ocupacional</Link>
        <nav aria-label="Principal">
          <NavLink to="/" end>Início</NavLink><NavLink to="/pacientes">Pacientes</NavLink><NavLink to="/catalogo">Catálogo</NavLink><NavLink to="/configuracoes">Dados</NavLink>
        </nav>
        <span className="small">{s.profile.displayName}</span>
        <button className="link" onClick={() => pro.logout()}>Sair</button>
      </div></header>
      <div className="banner">Modo local de demonstração: os dados ficam só neste navegador. Use apenas dados fictícios (pendência P-01 — Supabase).</div>
      <main id="main" className="container">
        {storageFailed() && <Alert tone="bad">Não foi possível gravar no navegador (armazenamento cheio ou bloqueado). Exporte seus dados em “Dados”.</Alert>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pacientes" element={<Patients />} />
          <Route path="/pacientes/:id" element={<PatientDetail />} />
          <Route path="/catalogo" element={<Catalog />} />
          <Route path="/avaliacoes/nova" element={<NewAssessment />} />
          <Route path="/avaliacoes/:id" element={<AssessmentDetail />} />
          <Route path="/avaliacoes/:id/preencher" element={<ProFill />} />
          <Route path="/avaliacoes/:id/relatorio" element={<Report />} />
          <Route path="/comparar/:patientId" element={<Compare />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="*" element={<p>Página não encontrada. <Link to="/">Voltar ao início</Link></p>} />
        </Routes>
      </main>
    </>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/r/:token" element={<Portal />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  )
}
