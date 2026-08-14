import * as XLSX from 'xlsx'

export const POSITION_SUPPLIER_BRIDGE_KEY = 'painel-sell-out-milenio:position-supplier-bridge:v1'
export const POSITION_SUPPLIER_DIAG_KEY = 'painel-sell-out-milenio:position-supplier-bridge-diag:v1'

export type PositionSupplierDiagnostics = {
  source: string
  sheet: string
  canonicalHeader: string
  supplierHeader: string
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

function codeKey(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/^0+/, '') || '0'
}

function findColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeText)
  const wanted = aliases.map(normalizeText)
  const exact = normalized.findIndex(header => wanted.includes(header))
  if (exact >= 0) return exact
  return normalized.findIndex(header => wanted.some(alias => header.includes(alias)))
}

function save(bridge: Record<string, string>, diagnostics: PositionSupplierDiagnostics) {
  try {
    localStorage.setItem(POSITION_SUPPLIER_BRIDGE_KEY, JSON.stringify(bridge))
    localStorage.setItem(POSITION_SUPPLIER_DIAG_KEY, JSON.stringify(diagnostics))
  } catch {
    // Diagnóstico auxiliar; o painel continua operacional sem persistência.
  }
}

export function readPositionSupplierBridge(): Record<string, string> {
  try {
    const raw = localStorage.getItem(POSITION_SUPPLIER_BRIDGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function readPositionSupplierDiagnostics(): PositionSupplierDiagnostics | null {
  try {
    const raw = localStorage.getItem(POSITION_SUPPLIER_DIAG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function capturePositionSupplierBridge(file: File) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  const canonicalAliases = ['CODIGO', 'CÓDIGO', 'COD', 'COD PRODUTO', 'CÓDIGO PRODUTO', 'CODIGO PRODUTO', 'CODPROD', 'CODPROD WINTHOR']
  const supplierAliases = [
    'COD FORNECEDOR', 'CÓDIGO FORNECEDOR', 'CODIGO FORNECEDOR', 'COD. FORNECEDOR',
    'COD FORN', 'COD FORNEC', 'CODFORNEC', 'CODFORNECEDOR',
    'COR FORNECEDOR', // tolera eventual grafia presente no relatório.
  ]

  let selected: { rows: Matrix; header: number; canonical: number; supplier: number; sheet: string; headers: unknown[] } | null = null

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
    for (let r = 0; r < Math.min(rows.length, 220); r += 1) {
      const headers = rows[r] ?? []
      const canonical = findColumn(headers, canonicalAliases)
      const supplier = findColumn(headers, supplierAliases)
      const cost = findColumn(headers, ['REAL', 'CUSTO REAL'])
      const sale = findColumn(headers, ['P VENDA', 'PVENDA', 'PREÇO VENDA', 'PRECO VENDA'])
      const qty = findColumn(headers, ['QT EST', 'QT ESTOQUE', 'QTDE EST', 'QTDE ESTOQUE'])
      if (canonical >= 0 && supplier >= 0 && cost >= 0 && sale >= 0 && qty >= 0) {
        selected = { rows, header: r, canonical, supplier, sheet: sheetName, headers }
        break
      }
    }
    if (selected) break
  }

  if (!selected) {
    const diagnostics: PositionSupplierDiagnostics = {
      source: file.name,
      sheet: '',
      canonicalHeader: 'NÃO IDENTIFICADA',
      supplierHeader: 'NÃO IDENTIFICADA',
      aliases: 0,
      ambiguousAliases: 0,
      examples: [],
    }
    save({}, diagnostics)
    return diagnostics
  }

  const candidates = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (let r = selected.header + 1; r < selected.rows.length; r += 1) {
    const row = selected.rows[r] ?? []
    const canonical = codeKey(row[selected.canonical])
    const supplier = codeKey(row[selected.supplier])
    if (!canonical || !supplier || canonical === supplier || ambiguous.has(supplier)) continue
    const existing = candidates.get(supplier)
    if (!existing) candidates.set(supplier, canonical)
    else if (existing !== canonical) {
      candidates.delete(supplier)
      ambiguous.add(supplier)
    }
  }

  const bridge = Object.fromEntries(candidates.entries())
  const diagnostics: PositionSupplierDiagnostics = {
    source: file.name,
    sheet: selected.sheet,
    canonicalHeader: String(selected.headers[selected.canonical] ?? 'Código'),
    supplierHeader: String(selected.headers[selected.supplier] ?? 'Código Fornecedor'),
    aliases: candidates.size,
    ambiguousAliases: ambiguous.size,
    examples: [...candidates.entries()].slice(0, 12).map(([supplier, canonical]) => `${supplier}→${canonical}`),
  }
  save(bridge, diagnostics)
  return diagnostics
}
