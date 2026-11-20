// Gera db/seed/001_catalogo_original.sql a partir de src/catalogo_original.json (cópia fiel do catálogo do ZIP).
import { readFileSync, writeFileSync } from 'node:fs'
const raw = JSON.parse(readFileSync(new URL('../src/catalogo_original.json', import.meta.url), 'utf8'))
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const areas = []; const seen = new Set()
for (const e of raw) {
  const a = slug(e.area)
  if (!seen.has(a)) { seen.add(a); areas.push({ code: a, parent: null, name: e.area }) }
  if (e.subcategory) { const s = `${a}.${slug(e.subcategory)}`; if (!seen.has(s)) { seen.add(s); areas.push({ code: s, parent: a, name: e.subcategory }) } }
}
let out = `-- GERADO por scripts/gen-seed.mjs — não editar à mão.\n-- Catálogo original (Orquestração Ocupacional.xlsx, Plan1): nomes, numeração (inclui 94 duplicado e lacuna 95) e linhas preservados.\n-- Categorização inferida das seções da planilha: PENDENTE DE VALIDAÇÃO CLÍNICA (P-02).\n\n`
areas.forEach((a, i) => { out += `insert into occupational_areas(code, name, source_label, sort_order, parent_id) values (${q(a.code)}, ${q(a.name)}, ${q(a.name)}, ${i}, ${a.parent ? `(select id from occupational_areas where code = ${q(a.parent)})` : 'null'});\n` })
out += '\n'
for (const e of raw) {
  const a = slug(e.area); const s = e.subcategory ? `${a}.${slug(e.subcategory)}` : null
  out += `insert into occupations(area_id, subarea_id, stable_key, name, origin, source_file, source_sheet, source_row, source_number) values ((select id from occupational_areas where code = ${q(a)}), ${s ? `(select id from occupational_areas where code = ${q(s)})` : 'null'}, ${q(e.stable_key)}, ${q(e.name_original)}, 'source_catalog', 'Orquestração Ocupacional.xlsx', ${q(e.source_sheet)}, ${e.source_row}, ${e.source_number});\n`
}
writeFileSync(new URL('../db/seed/001_catalogo_original.sql', import.meta.url), out)
console.log(areas.length, 'áreas;', raw.length, 'atividades')
