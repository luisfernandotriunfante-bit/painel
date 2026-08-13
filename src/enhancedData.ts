import * as XLSX from 'xlsx'
import { cleanId, normalizeText, SellerSales, CustomerSales } from './data'

export type DailyMovement = {
  day: number
  billed: number
  toInvoice: number
  sellOut: number
  positives: number
}

export type EnhancedSalesResult = {
  periodYear: number
  periodMonth: number
  periodLabel: string
  billed: number
  toInvoice: number
  sellOut: number
  potentialPositives: number
  daily: number[]
  dailyMovement: DailyMovement[]
  sellers: SellerSales[]
  customers: CustomerSales[]
  rows: number
  warnings: string[]
}

export type EnhancedHistoryResult = {
  byMonth: Record<string, Record<string, number>>
  rows: number
  monthCounts: Record<string, number>
  warnings: string[]
}

export type PositionItem = {
  code: string
  description: string
  line: string
  units: number
  costUnit: number
  saleUnit: number
  costValue: number
  saleValue: number
}

export type EnhancedPositionResult = {
  items: PositionItem[]
  financeByCode: Record<string, { cost?: number; sale?: number }>
  totalCost: number
  totalSale: number
  totalUnits: number
  rows: number
  warnings: string[]
}

type Matrix = unknown[][]

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  let text = String(value).trim()
  if (!text) return 0
  const trailingMinus = text.endsWith('-')
  text = text.replace(/R\$/gi, '').replace(/\s/g, '')
  if (trailingMinus) text = text.slice(0, -1)
  const hasComma = text.includes(',')
  const hasDot = text.includes('.')
  if (hasComma && hasDot) text = text.replace(/\./g, '').replace(',', '.')
  else if (hasComma) text = text.replace(',', '.')
  text = text.replace(/[^0-9.-]/g, '')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? (trailingMinus ? -parsed : parsed) : 0
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d)
  }
  const text = String(value ?? '').trim()
  const br = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/)
  if (br) {
    let year = Number(br[3])
    if (year < 100) year += 2000
    return new Date(year, Number(br[2]) - 1, Number(br[1]))
  }
  const native = new Date(text)
  return Number.isNaN(native.getTime()) ? null : native
}

function headerIndex(rows: Matrix, markers: string[][], maxRows = 80) {
  let best = { index: -1, score: -1 }
  for (let r = 0; r < Math.min(rows.length, maxRows); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeText)
    let score = 0
    for (const group of markers) {
      const wanted = group.map(normalizeText)
      if (headers.some(header => wanted.some(alias => header === alias || header.includes(alias)))) score += 1
    }
    if (score > best.score) best = { index: r, score }
  }
  return best
}

function findColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeText)
  const wanted = aliases.map(normalizeText)
  const exact = normalized.findIndex(header => wanted.includes(header))
  if (exact >= 0) return exact
  return normalized.findIndex(header => wanted.some(alias => header.includes(alias)))
}

function findExact(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeText)
  const wanted = aliases.map(normalizeText)
  return normalized.findIndex(header => wanted.includes(header))
}

function inferStatusColumn(rows: Matrix, startRow: number) {
  let winner = -1
  let winnerScore = 0
  const width = Math.max(...rows.slice(startRow, startRow + 180).map(row => row.length), 0)
  for (let col = 0; col < width; col += 1) {
    let score = 0
    for (let r = startRow; r < Math.min(rows.length, startRow + 220); r += 1) {
      const status = normalizeText(rows[r]?.[col])
      if (status === 'VENDA' || status === 'FATURADO' || status === 'A FATURAR') score += 1
    }
    if (score > winnerScore) {
      winner = col
      winnerScore = score
    }
  }
  return winnerScore > 0 ? winner : -1
}

export async function parseSalesEnhanced(file: File): Promise<EnhancedSalesResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('O 8022 não contém uma aba de dados.')
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
  const match = headerIndex(rows, [['DATA MOVIMENTO', 'DATA'], ['COD VENDEDOR'], ['VENDEDOR'], ['VALOR R NF', 'VALOR NF', 'VALOR'], ['NOME CLIENTE']], 80)
  if (match.index < 0 || match.score < 3) throw new Error('Não consegui localizar o cabeçalho do relatório 8022.')

  const headers = rows[match.index] ?? []
  const dataCol = findColumn(headers, ['DATA MOVIMENTO', 'DATA'])
  const sellerCodeCol = findColumn(headers, ['COD VENDEDOR', 'COD. VENDEDOR'])
  const sellerNameCol = findColumn(headers, ['VENDEDOR'])
  const valueCol = findColumn(headers, ['VALOR R$ NF', 'VALOR R NF', 'VALOR NF', 'VALOR'])
  const cnpjCol = findColumn(headers, ['CNPJ/CPF CLIENTE', 'CNPJ CPF CLIENTE', 'CNPJ CLIENTE', 'CPF CNPJ'])
  const clientCodeCol = findColumn(headers, ['COD CLIENTE', 'COD. CLIENTE'])
  let statusCol = findColumn(headers, ['STATUS PEDIDO', 'STATUS'])
  if (statusCol < 0) statusCol = inferStatusColumn(rows, match.index + 1)
  if (dataCol < 0 || valueCol < 0) throw new Error('O 8022 precisa conter data e valor da NF.')

  const datedRows: { row: unknown[]; date: Date }[] = []
  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const date = dateValue(row[dataCol])
    if (date) datedRows.push({ row, date })
  }
  if (!datedRows.length) throw new Error('Não encontrei movimentos com data válida no 8022.')

  const maxDate = datedRows.reduce((max, item) => item.date > max ? item.date : max, datedRows[0].date)
  const year = maxDate.getFullYear()
  const month = maxDate.getMonth() + 1
  const days = new Date(year, month, 0).getDate()
  const dailyMovement = Array.from({ length: days }, (_, index) => ({ day: index + 1, billed: 0, toInvoice: 0, sellOut: 0, positives: 0 }))
  const dailyCustomers = Array.from({ length: days }, () => new Set<string>())
  const sellerMap = new Map<string, { name: string; sellOut: number; customers: Set<string> }>()
  const customerMap = new Map<string, number>()
  const globalCustomers = new Set<string>()
  const warnings: string[] = []
  let billed = 0
  let toInvoice = 0
  let usedRows = 0
  let recognizedStatusRows = 0

  for (const item of datedRows) {
    if (item.date.getFullYear() !== year || item.date.getMonth() + 1 !== month) continue
    const row = item.row
    const value = numberValue(row[valueCol])
    const status = statusCol >= 0 ? normalizeText(row[statusCol]) : ''
    let kind: 'billed' | 'toInvoice' | null = null
    if (status.includes('A FATURAR')) kind = 'toInvoice'
    else if (status === 'VENDA' || status.includes('FATURADO') || status.includes('VENDA FATURADA')) kind = 'billed'
    else if (statusCol < 0) kind = 'billed'
    if (!kind) continue

    if (statusCol >= 0) recognizedStatusRows += 1
    usedRows += 1
    const dayIndex = item.date.getDate() - 1
    if (kind === 'billed') {
      billed += value
      dailyMovement[dayIndex].billed += value
    } else {
      toInvoice += value
      dailyMovement[dayIndex].toInvoice += value
    }
    dailyMovement[dayIndex].sellOut += value

    const sellerCode = cleanId(row[sellerCodeCol]) || normalizeText(row[sellerNameCol]) || 'SEM SETOR'
    const sellerName = String(row[sellerNameCol] ?? '').trim() || `Setor ${sellerCode}`
    const cnpj = cleanId(row[cnpjCol]) || cleanId(row[clientCodeCol])
    const seller = sellerMap.get(sellerCode) ?? { name: sellerName, sellOut: 0, customers: new Set<string>() }
    seller.sellOut += value
    if (cnpj && value > 0) {
      seller.customers.add(cnpj)
      globalCustomers.add(cnpj)
      dailyCustomers[dayIndex].add(cnpj)
      customerMap.set(cnpj, (customerMap.get(cnpj) ?? 0) + value)
    }
    sellerMap.set(sellerCode, seller)
  }

  dailyMovement.forEach((item, index) => { item.positives = dailyCustomers[index].size })
  if (statusCol >= 0 && recognizedStatusRows === 0) warnings.push('Nenhum status VENDA/A FATURAR foi reconhecido no 8022.')
  if (cnpjCol < 0) warnings.push('O 8022 não apresentou CNPJ; COD. CLIENTE foi usado como contingência.')

  const sellers = [...sellerMap.entries()].map(([code, value]) => ({ code, name: value.name, sellOut: value.sellOut, positives: value.customers.size })).sort((a, b) => b.sellOut - a.sellOut)
  const customers = [...customerMap.entries()].map(([cnpj, value]) => ({ cnpj, value }))
  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return {
    periodYear: year,
    periodMonth: month,
    periodLabel,
    billed,
    toInvoice,
    sellOut: billed + toInvoice,
    potentialPositives: globalCustomers.size,
    daily: dailyMovement.map(item => item.sellOut),
    dailyMovement,
    sellers,
    customers,
    rows: usedRows,
    warnings,
  }
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export async function parseHistoryEnhanced(file: File): Promise<EnhancedHistoryResult> {
  const text = await file.text()
  const lines = text.split(/\r\n|\n|\r/)
  const header = lines.find(line => line.includes('Data') && line.includes('Valor') && line.includes('Desconto') && line.includes('Cliente') && line.includes('RPC.'))
  if (!header) throw new Error('Não consegui localizar o cabeçalho do 379 2025.')
  const valueStart = header.indexOf('Valor')
  const discountStart = header.indexOf('Desconto')
  const clientStart = header.indexOf('Cliente')
  const rpcStart = header.indexOf('RPC.')
  if ([valueStart, discountStart, clientStart, rpcStart].some(index => index < 0)) throw new Error('O layout do 379 não corresponde ao esperado.')

  const byMonth: Record<string, Record<string, number>> = {}
  const monthSets: Record<string, Set<string>> = {}
  let used = 0
  for (const line of lines) {
    const match = line.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})/)
    if (!match) continue
    const month = Number(match[2])
    const year = Number(match[3])
    const value = numberValue(line.slice(valueStart, discountStart))
    const cnpj = cleanId(line.slice(clientStart, rpcStart))
    if (!cnpj) continue
    const key = monthKey(year, month)
    byMonth[key] ??= {}
    monthSets[key] ??= new Set<string>()
    byMonth[key][cnpj] = (byMonth[key][cnpj] ?? 0) + value
    monthSets[key].add(cnpj)
    used += 1
  }
  if (!used) throw new Error('O 379 foi aberto, mas nenhuma linha histórica foi processada.')
  const monthCounts = Object.fromEntries(Object.entries(monthSets).map(([key, set]) => [key, set.size]))
  return { byMonth, rows: used, monthCounts, warnings: [] }
}

function classifyLine(description: string) {
  const d = normalizeText(description)
  if (/^CD\b/.test(d)) return 'Creme Dental'
  if (/^SAB\b/.test(d)) return 'Sabonetes'
  if (/^(SH|COND|CR PENT|KIT SH)\b/.test(d)) return 'Hair'
  if (/^(ED|ENX|ENXAG|FITA DENT|FIO|GD)\b/.test(d)) return 'Esc + Enx + Fio'
  if (/^(PINHO SOL|LIMP|LAVA ROUPA|AJAX|DESINF|DESENG)\b/.test(d)) return 'Limpeza'
  return 'Outros'
}

function isTotalRow(row: unknown[]) {
  return row.some(value => {
    const text = normalizeText(value)
    return text.startsWith('TOTAL') || text.includes('TOTAL GERAL') || text.includes('TOTAL ESTOQUE')
  })
}

export async function parsePosition105Enhanced(file: File): Promise<EnhancedPositionResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  let best: { rows: Matrix; header: number; headers: unknown[]; qty: number; code: number; cost: number; sale: number; desc: number; score: number; sheet: string } | null = null

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
    const preamble = rows.slice(0, 80).flat().map(normalizeText).filter(Boolean)
    const consideredPhysical = preamble.some(text => text.includes('CONSIDERADO') && text.includes('FISICO')) || preamble.some(text => text === 'FISICO')
    const consideredAvailable = preamble.some(text => text.includes('CONSIDERADO') && text.includes('DISPONIVEL')) || preamble.some(text => text === 'DISPONIVEL')
    if (consideredAvailable && !consideredPhysical) throw new Error('Este 105 está gerado como “Considerado: Disponível”. Para o estoque oficial, gere o relatório 105 com “Considerado: Físico”.')

    for (let r = 0; r < Math.min(rows.length, 220); r += 1) {
      const headers = rows[r] ?? []
      const qty = findColumn(headers, ['QT EST', 'QT ESTOQUE', 'QTDE EST', 'QTDE ESTOQUE'])
      const code = findColumn(headers, ['CODIGO', 'COD', 'COD PRODUTO', 'CODIGO PRODUTO', 'CODPROD'])
      const cost = findExact(headers, ['REAL', 'CUSTO REAL'])
      const sale = findExact(headers, ['P VENDA', 'PVENDA', 'PRECO VENDA', 'PRECO DE VENDA'])
      const desc = findColumn(headers, ['DESCRICAO', 'DESCRIÇÃO', 'DESCRI'])
      let score = 0
      if (qty >= 0) score += 3
      if (cost >= 0) score += 3
      if (sale >= 0) score += 3
      if (code >= 0) score += 1
      if (desc >= 0) score += 1
      if (!best || score > best.score) best = { rows, header: r, headers, qty, code, cost, sale, desc, score, sheet: sheetName }
    }
  }

  if (!best || best.qty < 0 || best.cost < 0 || best.sale < 0) throw new Error('Não consegui localizar no 105 as colunas Qt.Est., Real e P. Venda.')
  const items: PositionItem[] = []
  const financeByCode: Record<string, { cost?: number; sale?: number }> = {}
  let totalCost = 0
  let totalSale = 0
  let totalUnits = 0

  for (let r = best.header + 1; r < best.rows.length; r += 1) {
    const row = best.rows[r] ?? []
    if (!row.length || isTotalRow(row)) continue
    const units = numberValue(row[best.qty])
    const costUnit = numberValue(row[best.cost])
    const saleUnit = numberValue(row[best.sale])
    const code = best.code >= 0 ? cleanId(row[best.code]) : ''
    const description = best.desc >= 0 ? String(row[best.desc] ?? '').trim() : ''
    if (code && (costUnit || saleUnit)) financeByCode[code] = { cost: costUnit, sale: saleUnit }
    if (!units) continue
    const costValue = units * costUnit
    const saleValue = units * saleUnit
    items.push({ code, description, line: classifyLine(description), units, costUnit, saleUnit, costValue, saleValue })
    totalUnits += units
    totalCost += costValue
    totalSale += saleValue
  }

  if (!items.length) throw new Error(`O 105 foi reconhecido na aba “${best.sheet}”, mas nenhuma posição física foi encontrada.`)
  return {
    items,
    financeByCode,
    totalCost,
    totalSale,
    totalUnits,
    rows: items.length,
    warnings: ['A classificação de linha é operacional e continua baseada na descrição do produto até existir um campo oficial de linha.'],
  }
}
