import * as XLSX from 'xlsx'
import { cleanId, normalizeText, SellerSales, CustomerSales } from './data'
import type { DailyMovement } from './enhancedData'

export type SalesV3Result = {
  periodYear: number
  periodMonth: number
  periodLabel: string
  billed: number
  toInvoice: number
  sellOut: number
  billedPositives: number
  potentialPositives: number
  daily: number[]
  dailyMovement: DailyMovement[]
  sellers: SellerSales[]
  customers: CustomerSales[]
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

export async function parseSalesV3(file: File): Promise<SalesV3Result> {
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
  const dailyMovement: DailyMovement[] = Array.from({ length: days }, (_, index) => ({ day: index + 1, billed: 0, toInvoice: 0, sellOut: 0, positives: 0 }))
  const dailyCustomers = Array.from({ length: days }, () => new Set<string>())
  const sellerMap = new Map<string, { name: string; sellOut: number; customers: Set<string> }>()
  const customerMap = new Map<string, number>()
  const billedCustomers = new Set<string>()
  const potentialCustomers = new Set<string>()
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
      potentialCustomers.add(cnpj)
      if (kind === 'billed') billedCustomers.add(cnpj)
      dailyCustomers[dayIndex].add(cnpj)
      customerMap.set(cnpj, (customerMap.get(cnpj) ?? 0) + value)
    }
    sellerMap.set(sellerCode, seller)
  }

  dailyMovement.forEach((item, index) => { item.positives = dailyCustomers[index].size })
  if (statusCol >= 0 && recognizedStatusRows === 0) warnings.push('Nenhum status VENDA/A FATURAR foi reconhecido no 8022.')
  if (cnpjCol < 0) warnings.push('O 8022 não apresentou CNPJ; COD. CLIENTE foi usado como contingência.')

  const sellers = [...sellerMap.entries()]
    .map(([code, value]) => ({ code, name: value.name, sellOut: value.sellOut, positives: value.customers.size }))
    .sort((a, b) => b.sellOut - a.sellOut)
  const customers = [...customerMap.entries()].map(([cnpj, value]) => ({ cnpj, value }))
  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return {
    periodYear: year,
    periodMonth: month,
    periodLabel,
    billed,
    toInvoice,
    sellOut: billed + toInvoice,
    billedPositives: billedCustomers.size,
    potentialPositives: potentialCustomers.size,
    daily: dailyMovement.map(item => item.sellOut),
    dailyMovement,
    sellers,
    customers,
    rows: usedRows,
    warnings,
  }
}
