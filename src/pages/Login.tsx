import { useState } from 'react'
import { pro } from '../data/store'
import { Alert, Field } from '../ui/common'

export function Login() {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  return (
    <main className="center container">
      <div className="card">
        <h1>Orquestração Ocupacional</h1>
        <p className="muted">Organize as informações de rotina e atividades relatadas por pacientes, responsáveis e profissionais.</p>
        <Alert tone="warn"><b>Modo local de demonstração.</b> Esta versão guarda tudo apenas neste navegador e não tem autenticação real. Use somente dados fictícios. A autenticação de profissionais com Supabase está documentada como pendência (P-01).</Alert>
        <form onSubmit={(e) => { e.preventDefault(); try { pro.login(name) } catch (x) { setErr((x as Error).message) } }}>
          <Field label="Seu nome (profissional)" id="nome"><input id="nome" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {err && <Alert tone="bad">{err}</Alert>}
          <button type="submit">Entrar</button>
        </form>
      </div>
    </main>
  )
}
