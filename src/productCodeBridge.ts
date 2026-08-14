import * as XLSX from 'xlsx'

export const PRODUCT_CODE_BRIDGE_KEY = 'painel-sell-out-milenio:product-code-bridge:v1'
export const PRODUCT_CODE_BRIDGE_DIAG_KEY = 'painel-sell-out-milenio:product-code-bridge-diag:v1'

export type ProductCodeBridge = Record<string, string>

export type ProductCodeBridgeDiagnostics = {
  source: string
  rows: number
  codeColumns: string[]
  canonicalColumn: string
  aliases: number
  ambiguousAliases: number
  examples: string[]
}

type Matrix = unknown[][]

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

export function codeKey(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/^0+/, '') || '0'
}

export function readProductCodeBridge(): ProductCodeBridge {
  try {
    const raw = localStorage.getItem(PRODUCT_CODE_BRIDGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function readProductCodeBridgeDiagnostics(): ProductCodeBridgeDiagnostics | null {
  try {
    const raw = localStorage.getItem(PRODUCT_CODE_BRIDGE_DIAG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const CANONICAL_HEADERS = [
  'CODIGO', 'COD', 'COD PRODUTO', 'CODIGO PRODUTO', 'CODPROD',
  'CODPROD WINTHOR', 'COD PRODUTO WINTHOR', 'CODIGO WINTHOR',
]

const ALIAS_HEADERS = [
  'COD FAB', 'COD FABRICA', 'CODFABRICA', 'COD FABRICANTE', 'CODFABRICANTE', 'CODIGO FABRICANTE',
  'COD FORN', 'COD FORNEC', 'CODFORNEC', 'COD FORNECEDOR', 'CODFORNECEDOR', 'CODIGO FORNECEDOR',
  'COD AUX', 'COD AUXILIAR', 'CODAUXILIAR', 'CODIGO AUXILIAR',
  'COD SEC', 'COD SECUNDARIO', 'CODIGO SECUNDARIO',
  'REFERENCIA', 'REF', 'REF FABRICA', 'REF FORNECEDOR',
  'MATERIAL', 'MATERIAL NUMBER', 'MATERIAL CODE', 'COD MATERIAL', 'CODIGO MATERIAL',
  'SKU', 'SKU FORNECEDOR', 'SKU FABRICANTE',
  'SAP', 'COD SAP', 'CODIGO SAP',
]

function headerMatches(value: unknown, aliases: string[]) {
  const h = normalizeText(value)
  return aliases.some(alias => h === normalizeText(alias))
}

export function isLikelyProductCodeHeader(value: unknown) {
  return headerMatches(value, [...CANONICAL_HEADERS, ...ALIAS_HEADERS])
}

function findHeader(rows: Matrix) {
  let best = { index: -1, score: -1 }
  for (let r = 0; r < Math.min(rows.length, 100); r += 1) {
    const row = rows[r] ?? []
    const normalized = row.map(normalizeText)
    const canonical = row.findIndex(cell => headerMatches(cell, CANONICAL_HEADERS))
    if (canonical < 0) continue
    const aliasCount = row.filter(cell => headerMatches(cell, ALIAS_HEADERS)).length
    let score = 5 + aliasCount * 2
    if (normalized.some(h => h.includes('DESCRI'))) score += 2
    if (normalized.some(h => h === 'CLASSE' || h.includes('EMB'))) score += 1
    if (score > best.score) best = { index: r, score }
  }
  return best.index
}

export async function buildProductCodeBridgeFromFile(file: File) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })

  let selected: { rows: Matrix; header: number; sheet: string } | null = null
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
    const header = findHeader(rows)
    if (header >= 0) {
      selected = { rows, header, sheet: sheetName }
      break
    }
  }

  if (!selected) {
    const diagnostics: ProductCodeBridgeDiagnostics = {
      source: file.name,
      rows: 0,
      codeColumns: [],
      canonicalColumn: 'NÃO IDENTIFICADA',
      aliases: 0,
      ambiguousAliases: 0,
      examples: [],
    }
    saveProductCodeBridge({}, diagnostics)
    return diagnostics
  }

  const headers = selected.rows[selected.header] ?? []
  const canonicalCol = headers.findIndex(cell => headerMatches(cell, CANONICAL_HEADERS))
  const aliasCols = headers
    .map((cell, index) => ({ index, header: String(cell ?? '').trim() }))
    .filter(item => item.index !== canonicalCol && headerMatches(item.header, ALIAS_HEADERS))

  const candidates = new Map<string, string>()
  const ambiguous = new Set<string>()
  let usedRows = 0

  for (let r = selected.header + 1; r < selected.rows.length; r += 1) {
    const row = selected.rows[r] ?? []
    const canonical = codeKey(row[canonicalCol])
    if (!canonical) continue
    usedRows += 1

    for (const aliasCol of aliasCols) {
      const alias = codeKey(row[aliasCol.index])
      if (!alias || alias === canonical || ambiguous.has(alias)) continue
      const existing = candidates.get(alias)
      if (!existing) candidates.set(alias, canonical)
      else if (existing !== canonical) {
        candidates.delete(alias)
        ambiguous.add(alias)
      }
    }
  }

  const bridge: ProductCodeBridge = {}
  for (const [alias, canonical] of candidates.entries()) bridge[alias] = canonical

  const diagnostics: ProductCodeBridgeDiagnostics = {
    source: file.name,
    rows: usedRows,
    codeColumns: [String(headers[canonicalCol] ?? '').trim(), ...aliasCols.map(item => item.header)].filter(Boolean),
    canonicalColumn: String(headers[canonicalCol] ?? '').trim() || 'CÓDIGO',
    aliases: Object.keys(bridge).length,
    ambiguousAliases: ambiguous.size,
    examples: Object.entries(bridge).slice(0, 10).map(([alias, canonical]) => `${alias}→${canonical}`),
  }

  saveProductCodeBridge(bridge, diagnostics)
  return diagnostics
}

export function saveProductCodeBridge(bridge: ProductCodeBridge, diagnostics: ProductCodeBridgeDiagnostics) {
  try {
    localStorage.setItem(PRODUCT_CODE_BRIDGE_KEY, JSON.stringify(bridge))
    localStorage.setItem(PRODUCT_CODE_BRIDGE_DIAG_KEY, JSON.stringify(diagnostics))
  } catch {
    // O de/para é auxiliar; o restante do painel continua operacional sem persistência.
  }
}
