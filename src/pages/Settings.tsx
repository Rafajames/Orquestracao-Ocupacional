import { useState } from 'react'
import { pro, getState } from '../data/store'
import { Alert } from '../ui/common'

export function Settings() {
  const [confirm, setConfirm] = useState(false)
  const download = () => {
    const url = URL.createObjectURL(new Blob([pro.exportData()], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'orquestracao-ocupacional-dados.json'; a.click(); URL.revokeObjectURL(url)
  }
  const n = getState()
  return (
    <>
      <h1>Dados do modo local</h1>
      <div className="card">
        <p>Neste modo os dados ficam apenas neste navegador: {n.patients.length} paciente(s), {n.assessments.length} avaliação(ões), {n.records.length} registro(s).</p>
        <Alert tone="warn">Limpar os dados do navegador apaga tudo. Os links dos respondentes só funcionam neste mesmo navegador. Para uso real com pacientes é necessário conectar o Supabase (pendência P-01) e concluir a revisão de privacidade (P-06).</Alert>
        <div className="row"><button className="secondary" onClick={download}>Exportar tudo (JSON)</button>
          {!confirm ? <button className="danger" onClick={() => setConfirm(true)}>Apagar todos os dados…</button>
            : <><b>Tem certeza? Isso não pode ser desfeito.</b><button className="danger" onClick={() => { pro.resetAllData(); setConfirm(false) }}>Sim, apagar</button><button className="secondary" onClick={() => setConfirm(false)}>Cancelar</button></>}</div>
      </div>
    </>
  )
}
