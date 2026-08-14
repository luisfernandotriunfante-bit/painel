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

type BridgeLayout = {
  header: number
  canonicalCol: number
  aliasCols: { index: number; header: string }[]
  canonicalLabel: string
}

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
  const key = digits.replace(/^0+/, '') || '0'
  return key === '0' ? '' : key
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
  'FABRICA',
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

function numericRatio(rows: Matrix, start: number, col: number) {
  let seen = 0
  let numeric = 0
  for (let r = start; r < Math.min(rows.length, start + 80); r += 1) {
    const value = rows[r]?.[col]
    if (value == null || value === '') continue
    seen += 1
    if (codeKey(value)) numeric += 1
  }
  return seen ? numeric / seen : 0
}

function find286Layout(rows: Matrix): BridgeLayout | null {
  let best: { layout: BridgeLayout; score: number } | null = null

  for (let r = 0; r < Math.min(rows.length, 120); r += 1) {
    const row = rows[r] ?? []
    const normalized = row.map(normalizeText)
    const factoryCol = normalized.findIndex(header => header === 'FABRICA')
    const descCol = normalized.findIndex(header => header.startsWith('DESCRI'))
    if (factoryCol < 0 || descCol <= 0) continue

    // No relatório 286 validado em 14/08/2026, o código interno do produto
    // fica imediatamente antes da descrição, embora o cabeçalho visual seja
    // montado em duas linhas. Essa regra evita confundir o código da filial.
    const canonicalCol = descCol - 1
    const ratio = numericRatio(rows, r + 1, canonicalCol)
    if (ratio < 0.5) continue

    const score = 10 + ratio * 5
    const layout: BridgeLayout = {
      header: r,
      canonicalCol,
      aliasCols: [{ index: factoryCol, header: String(row[factoryCol] ?? 'Fábrica').trim() || 'Fábrica' }],
      canonicalLabel: 'Código produto (coluna anterior à Descrição)',
    }
    if (!best || score > best.score) best = { layout, score }
  }

  return best?.layout ?? null
}

function findGenericLayout(rows: Matrix): BridgeLayout | null {
  let best: { layout: BridgeLayout; score: number } | null = null

  for (let r = 0; r < Math.min(rows.length, 100); r += 1) {
    const row = rows[r] ?? []
    const normalized = row.map(normalizeText)
    const canonicalCol = row.findIndex(cell => headerMatches(cell, CANONICAL_HEADERS))
    if (canonicalCol < 0) continue

    const aliasCols = row
      .map((cell, index) => ({ index, header: String(cell ?? '').trim() }))
      .filter(item => item.index !== canonicalCol && headerMatches(item.header, ALIAS_HEADERS))
    if (!aliasCols.length) continue

    let score = 5 + aliasCols.length * 2
    if (normalized.some(h => h.includes('DESCRI'))) score += 2
    if (normalized.some(h => h === 'CLASSE' || h.includes('EMB'))) score += 1

    const layout: BridgeLayout = {
      header: r,
      canonicalCol,
      aliasCols,
      canonicalLabel: String(row[canonicalCol] ?? '').trim() || 'Código',
    }
    if (!best || score > best.score) best = { layout, score }
  }

  return best?.layout ?? null
}

function buildBridge(rows: Matrix, layout: BridgeLayout) {
  const candidates = new Map<string, string>()
  const ambiguous = new Set<string>()
  let usedRows = 0

  for (let r = layout.header + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const canonical = codeKey(row[layout.canonicalCol])
    if (!canonical) continue

    let rowUsed = false
    for (const aliasCol of layout.aliasCols) {
      const alias = codeKey(row[aliasCol.index])
      if (!alias || alias === canonical || ambiguous.has(alias)) continue
      rowUsed = true
      const existing = candidates.get(alias)
      if (!existing) candidates.set(alias, canonical)
      else if (existing !== canonical) {
        candidates.delete(alias)
        ambiguous.add(alias)
      }
    }
    if (rowUsed) usedRows += 1
  }

  const bridge: ProductCodeBridge = {}
  for (const [alias, canonical] of candidates.entries()) bridge[alias] = canonical
  return { bridge, ambiguous, usedRows }
}

export async function buildProductCodeBridgeFromFile(file: File) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })

  let selected: { rows: Matrix; layout: BridgeLayout; sheet: string } | null = null
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
    const layout = find286Layout(rows) ?? findGenericLayout(rows)
    if (layout) {
      selected = { rows, layout, sheet: sheetName }
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

  const { bridge, ambiguous, usedRows } = buildBridge(selected.rows, selected.layout)
  const diagnostics: ProductCodeBridgeDiagnostics = {
    source: file.name,
    rows: usedRows,
    codeColumns: [selected.layout.canonicalLabel, ...selected.layout.aliasCols.map(item => item.header)],
    canonicalColumn: selected.layout.canonicalLabel,
    aliases: Object.keys(bridge).length,
    ambiguousAliases: ambiguous.size,
    examples: Object.entries(bridge).slice(0, 12).map(([alias, canonical]) => `${alias}→${canonical}`),
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
