import { useState } from 'react'
import { AREAS, allOccupations, pro, useStore } from '../data/store'
import { Alert, Badge, Field } from '../ui/common'

export function Catalog() {
  const s = useStore()
  const [q, setQ] = useState(''); const [name, setName] = useState(''); const [area, setArea] = useState('avd'); const [sub, setSub] = useState(''); const [desc, setDesc] = useState(''); const [err, setErr] = useState('')
  const top = AREAS.filter((a) => !a.parentCode)
  const subs = AREAS.filter((a) => a.parentCode === area)
  const occ = allOccupations(s).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <h1>Catálogo de atividades</h1>
      <Alert tone="warn">A organização por áreas e subáreas foi inferida das seções da planilha original e <b>precisa de validação profissional</b> (pendência P-02). Os nomes e a numeração originais são preservados; mudanças aqui não alteram avaliações já criadas.</Alert>
      <div className="card"><h2>Nova atividade personalizada</h2>
        <form onSubmit={(e) => { e.preventDefault(); try { pro.addCustomOccupation({ name, areaCode: area, subareaCode: sub || null, description: desc }); setName(''); setDesc(''); setErr('') } catch (x) { setErr((x as Error).message) } }}>
          <div className="grid g3">
            <Field label="Nome" id="cn"><input id="cn" type="text" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Área" id="ca"><select id="ca" value={area} onChange={(e) => { setArea(e.target.value); setSub('') }}>{top.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></Field>
            {subs.length > 0 && <Field label="Subcategoria" id="cs"><select id="cs" value={sub} onChange={(e) => setSub(e.target.value)}><option value="">(nenhuma)</option>{subs.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></Field>}
          </div>
          <Field label="Descrição" hint="(opcional)" id="cd"><input id="cd" type="text" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          {err && <Alert tone="bad">{err}</Alert>}<button type="submit">Adicionar</button>
        </form></div>
      <div className="card"><div className="row between"><h2>Atividades ({occ.length})</h2><input type="text" aria-label="Buscar no catálogo" placeholder="Buscar…" style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {top.map((a) => {
          const items = occ.filter((o) => o.areaCode === a.code)
          if (!items.length) return null
          const groups = [{ t: a.name, list: items.filter((o) => !o.subareaCode) }, ...AREAS.filter((x) => x.parentCode === a.code).map((x) => ({ t: `${a.name} · ${x.name}`, list: items.filter((o) => o.subareaCode === x.code) }))].filter((g) => g.list.length)
          return groups.map((g) => <details key={g.t} open={!!q}><summary>{g.t} ({g.list.length})</summary>
            <div className="tablewrap"><table><thead><tr><th>Atividade</th><th>Origem</th><th>Nº original</th><th>Para novas avaliações</th></tr></thead>
              <tbody>{g.list.map((o) => { const off = s.hiddenOccupationIds.includes(o.id); return <tr key={o.id}>
                <td>{o.name}{o.description && <div className="small muted">{o.description}</div>}</td>
                <td>{o.origin === 'custom' ? <Badge tone="info">personalizada</Badge> : <Badge>original</Badge>}</td>
                <td>{o.sourceNumber ?? '—'}{o.sourceNumber === 94 && <span className="small muted"> (numeração repetida na planilha)</span>}</td>
                <td><button className="secondary small" onClick={() => pro.toggleOccupation(o.id)} aria-pressed={!off}>{off ? 'Desativada — ativar' : 'Ativa — desativar'}</button></td></tr> })}</tbody></table></div></details>)
        })}
      </div>
    </>
  )
}
