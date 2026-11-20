import raw from '../catalogo_original.json'
import type { Area, FieldConfig, Occupation, OccupationSnapshot } from './types'

interface RawEntry {
  source_number: number
  name_original: string
  area: string
  subcategory: string | null
  source_sheet: string
  source_row: number
  stable_key: string
}

export const SOURCE_FILE = 'Orquestração Ocupacional.xlsx'
export const METHODOLOGY_VERSION = 'documentacao-v1.0 / catalogo-original-plan1'

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/** Áreas e subáreas derivadas do catálogo original (ADR-008 — classificação a validar). */
export function buildAreas(entries: RawEntry[] = raw as RawEntry[]): Area[] {
  const areas: Area[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const ac = slug(e.area)
    if (!seen.has(ac)) { seen.add(ac); areas.push({ code: ac, name: e.area, parentCode: null, sortOrder: areas.length }) }
    if (e.subcategory) {
      const sc = `${ac}.${slug(e.subcategory)}`
      if (!seen.has(sc)) { seen.add(sc); areas.push({ code: sc, name: e.subcategory, parentCode: ac, sortOrder: areas.length }) }
    }
  }
  return areas
}

/** Catálogo original, sem alterar nomes, numeração (inclui duplicidade 94) nem linha de origem. */
export function buildSourceCatalog(entries: RawEntry[] = raw as RawEntry[]): Occupation[] {
  return entries.map((e) => {
    const ac = slug(e.area)
    return {
      id: e.stable_key,
      stableKey: e.stable_key,
      name: e.name_original,
      areaCode: ac,
      subareaCode: e.subcategory ? `${ac}.${slug(e.subcategory)}` : null,
      origin: 'source_catalog',
      sourceNumber: e.source_number,
      sourceRow: e.source_row,
      sourceSheet: e.source_sheet,
      ownerOrganizationId: null,
      isActive: true,
    }
  })
}

export function snapshotOccupation(o: Occupation, areas: Area[]): OccupationSnapshot {
  const a = areas.find((x) => x.code === o.areaCode)
  const s = o.subareaCode ? areas.find((x) => x.code === o.subareaCode) : undefined
  return {
    occupationId: o.id,
    stableKey: o.stableKey,
    name: o.name,
    areaCode: o.areaCode,
    areaName: a?.name ?? o.areaCode,
    subareaCode: o.subareaCode,
    subareaName: s?.name ?? null,
    origin: o.origin,
    sourceNumber: o.sourceNumber,
  }
}

export function defaultFieldConfig(): FieldConfig {
  return {
    fields: {
      status: { enabled: true, required: true },
      duration: { enabled: true, required: false },
      occurrences: { enabled: true, required: false },
      direct_total: { enabled: true, required: false },
      frequency: { enabled: true, required: false },
      satisfaction: { enabled: true, required: false },
      discomfort: { enabled: true, required: false },
      notes: { enabled: true, required: false },
      start_end_time: { enabled: false, required: false },
    },
    discomfortMultiple: false,
    maxMinutesPerField: 1440,
  }
}

/** Datas do período configurado — não assume semana completa nem dia inicial (ADR-017). */
export function periodDates(start: string, end: string, max = 62): string[] {
  const out: string[] = []
  const d = new Date(start + 'T12:00:00Z')
  const e = new Date(end + 'T12:00:00Z')
  while (d <= e && out.length < max) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}
