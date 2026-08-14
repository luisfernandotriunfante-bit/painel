import * as XLSX from 'xlsx'
import { cleanId, normalizeText, SellerSales, CustomerSales } from './data'
import type { DailyMovement } from './enhancedData'

const LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const
type LineName = typeof LINE_NAMES[number]
type LineSales = Record<LineName, number>

type DetailedSellerSales = SellerSales & {
  billed: number
  toInvoice: number
  billedPositives: number
  toInvoicePositives: number
  lineSales: LineSales
}

type DetailedCustomerSales = CustomerSales & {
  billed: number
  toInvoice: number
}

type DetailedDailyMovement = DailyMovement & {
  billedPositives: number
  toInvoicePositives: number
}

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
  dailyMovement: DetailedDailyMovement[]
  sellers: DetailedSellerSales[]
  customers: DetailedCustomerSales[]
  rows: number
  warnings: string[]
}

type Matrix = unknown[][]
type SplitValue = { billed: number; toInvoice: number }
type SellerAccumulator = {
  name: string
  billed: number
  toInvoice: number
  customers: Map<string, SplitValue>
  lineSales: LineSales
}

function emptyLines(): LineSales {
  return {
    'Creme Dental': 0,
    'Esc + Enx + Fio': 0,
    'Sabonetes': 0,
    Hair: 0,
    Limpeza: 0,
  }
}

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

function addSplit(map: Map<string, SplitValue>, key: string, kind: 'billed' | 'toInvoice', value: number) {
  const current = map.get(key) ?? { billed: 0, toInvoice: 0 }
  current[kind] += value
  map.set(key, current)
}

function positiveCounts(values: Iterable<SplitValue>) {
  let billed = 0
  let toInvoice = 0
  let total = 0
  for (const value of values) {
    const sum = value.billed + value.toInvoice
    if (value.billed > 0) billed += 1
    if (sum > 0) {
      total += 1
      if (value.billed <= 0 && value.toInvoice > 0) toInvoice += 1
    }
  }
  return { billed, toInvoice, total }
}

function classifyByGrouping(value: unknown): LineName | 'Outros' | '' {
  const code = Math.trunc(numberValue(value))
  if ([1, 9, 14, 21].includes(code)) return 'Creme Dental'
  if ([2, 3, 17].includes(code)) return 'Esc + Enx + Fio'
  if ([4, 15, 20].includes(code)) return 'Sabonetes'
  if ([5, 8, 18].includes(code)) return 'Hair'
  if ([6, 10, 16].includes(code)) return 'Limpeza'
  if ([7, 19].includes(code)) return 'Outros'
  return ''
}

function classifyByDescription(description: unknown): LineName | '' {
  const d = normalizeText(description)
  if (!d) return ''
  if (/^CD\b/.test(d) || d.includes('CREME DENTAL') || d.includes('DENTIFRICIO')) return 'Creme Dental'
  if (/^SAB\b/.test(d) || d.includes('SABONETE BARRA')) return 'Sabonetes'
  if (/^(SH|COND|CR PENT|KIT SH)\b/.test(d) || d.includes('SHAMPOO') || d.includes('CONDICIONADOR')) return 'Hair'
  if (/^(ED|ENX|ENXAG|FITA DENT|FIO|GD)\b/.test(d) || d.includes('ESCOVA DENTAL') || d.includes('ENXAGUANTE') || d.includes('FIO DENTAL')) return 'Esc + Enx + Fio'
  if (/^(PINHO SOL|LIMP|LAVA ROUPA|AJAX|DESINF|DESENG)\b/.test(d) || d.includes('LIMPADOR') || d.includes('DESINFETANTE')) return 'Limpeza'
  return ''
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function closeEnough(a: number, b: number) {
  return Math.abs(a - b) < 0.01
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
  const groupingCol = findColumn(headers, ['AGRUP', 'AGRUPAMENTO', 'COD AGRUP', 'COD. AGRUP', 'GRUPO PRODUTO'])
  const productDescriptionCol = findColumn(headers, ['DESCRICAO PRODUTO', 'DESCRIÇÃO PRODUTO', 'NOME PRODUTO', 'DESCRICAO ITEM', 'DESCRIÇÃO ITEM', 'NOME ITEM'])
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
  const dailyMovement: DetailedDailyMovement[] = Array.from({ length: days }, (_, index) => ({ day: index + 1, billed: 0, toInvoice: 0, sellOut: 0, positives: 0, billedPositives: 0, toInvoicePositives: 0 }))
  const dailyCustomerValues = Array.from({ length: days }, () => new Map<string, SplitValue>())
  const sellerMap = new Map<string, SellerAccumulator>()
  const customerMap = new Map<string, SplitValue>()
  const warnings: string[] = []
  let billed = 0
  let toInvoice = 0
  let usedRows = 0
  let recognizedStatusRows = 0
  let rowsWithoutCustomer = 0
  let valueWithoutCustomer = 0
  let unclassifiedValue = 0
  let outsideFiveLinesValue = 0

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
    const seller = sellerMap.get(sellerCode) ?? { name: sellerName, billed: 0, toInvoice: 0, customers: new Map<string, SplitValue>(), lineSales: emptyLines() }
    seller[kind] += value

    const groupingLine = groupingCol >= 0 ? classifyByGrouping(row[groupingCol]) : ''
    const line = groupingLine || classifyByDescription(productDescriptionCol >= 0 ? row[productDescriptionCol] : '')
    if (LINE_NAMES.includes(line as LineName)) seller.lineSales[line as LineName] += value
    else if (groupingLine === 'Outros') outsideFiveLinesValue += value
    else unclassifiedValue += value

    if (cnpj) {
      addSplit(customerMap, cnpj, kind, value)
      addSplit(seller.customers, cnpj, kind, value)
      addSplit(dailyCustomerValues[dayIndex], cnpj, kind, value)
    } else {
      rowsWithoutCustomer += 1
      valueWithoutCustomer += value
    }
    sellerMap.set(sellerCode, seller)
  }

  dailyMovement.forEach((movement, index) => {
    const counts = positiveCounts(dailyCustomerValues[index].values())
    movement.billedPositives = counts.billed
    movement.toInvoicePositives = counts.toInvoice
    movement.positives = counts.total
  })

  const globalPositiveCounts = positiveCounts(customerMap.values())
  const sellers: DetailedSellerSales[] = [...sellerMap.entries()]
    .map(([code, value]) => {
      const counts = positiveCounts(value.customers.values())
      return {
        code,
        name: value.name,
        sellOut: value.billed + value.toInvoice,
        billed: value.billed,
        toInvoice: value.toInvoice,
        positives: counts.total,
        billedPositives: counts.billed,
        toInvoicePositives: counts.toInvoice,
        lineSales: value.lineSales,
      }
    })
    .sort((a, b) => b.sellOut - a.sellOut)

  const customers: DetailedCustomerSales[] = [...customerMap.entries()].map(([cnpj, value]) => ({
    cnpj,
    billed: value.billed,
    toInvoice: value.toInvoice,
    value: value.billed + value.toInvoice,
  }))

  const sellOut = billed + toInvoice
  const dailyTotal = dailyMovement.reduce((sum, item) => sum + item.sellOut, 0)
  const sellerTotal = sellers.reduce((sum, item) => sum + item.sellOut, 0)
  const customerTotal = customers.reduce((sum, item) => sum + item.value, 0)

  if (statusCol >= 0 && recognizedStatusRows === 0) warnings.push('Nenhum status VENDA/A FATURAR foi reconhecido no 8022.')
  if (cnpjCol < 0) warnings.push('O 8022 não apresentou CNPJ; COD. CLIENTE foi usado como contingência.')
  if (groupingCol < 0 && productDescriptionCol < 0) warnings.push('O 8022 não apresentou agrupamento nem descrição de produto; as cinco linhas de produto ainda não podem ser apuradas.')
  if (unclassifiedValue !== 0) warnings.push(`8022: ${money(unclassifiedValue)} do Sell Out ficaram sem classificação nas cinco linhas de produto.`)
  if (outsideFiveLinesValue !== 0) warnings.push(`8022: ${money(outsideFiveLinesValue)} pertencem a agrupamentos fora das cinco linhas do painel (ex.: 7/19).`)
  if (rowsWithoutCustomer) warnings.push(`8022: ${rowsWithoutCustomer} linhas (${money(valueWithoutCustomer)}) não possuem cliente identificável; elas entram no Sell Out, mas não podem ser atribuídas a rede/positivação.`)
  if (!closeEnough(sellOut, billed + toInvoice)) warnings.push('CONFERÊNCIA 8022: Sell Out não fecha com Faturado + A Faturar.')
  if (!closeEnough(dailyTotal, sellOut)) warnings.push(`CONFERÊNCIA 8022: soma diária difere do Sell Out em ${money(dailyTotal - sellOut)}.`)
  if (!closeEnough(sellerTotal, sellOut)) warnings.push(`CONFERÊNCIA 8022: soma por vendedor difere do Sell Out em ${money(sellerTotal - sellOut)}.`)
  if (rowsWithoutCustomer === 0 && !closeEnough(customerTotal, sellOut)) warnings.push(`CONFERÊNCIA 8022: soma por cliente difere do Sell Out em ${money(customerTotal - sellOut)}.`)

  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return {
    periodYear: year,
    periodMonth: month,
    periodLabel,
    billed,
    toInvoice,
    sellOut,
    billedPositives: globalPositiveCounts.billed,
    potentialPositives: globalPositiveCounts.total,
    daily: dailyMovement.map(item => item.sellOut),
    dailyMovement,
    sellers,
    customers,
    rows: usedRows,
    warnings,
  }
}
