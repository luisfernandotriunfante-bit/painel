import * as XLSX from 'xlsx'

export type UploadKey = 'sales' | 'stock' | 'targets' | 'catalog' | 'premises' | 'history' | 'transit'

export type UploadInfo = {
  name: string
  size: number
  updatedAt: string
  rows?: number
  detail?: string
} | null

export type SellerTarget = {
  code: string
  name: string
  target: number
  positiveTarget: number
}

export type SellerSales = {
  code: string
  name: string
  sellOut: number
  positives: number
}

export type CustomerSales = {
  cnpj: string
  value: number
}

export type SalesResult = {
  periodYear: number
  periodMonth: number
  periodLabel: string
  billed: number
  toInvoice: number
  sellOut: number
  potentialPositives: number
  daily: number[]
  sellers: SellerSales[]
  customers: CustomerSales[]
  rows: number
  headers: string[]
  warnings: string[]
}

export type StockItem = {
  code: string
  description: string
  category: string
  units: number
  boxes: number
  line: string
  rule: string
}

export type StockResult = {
  items: StockItem[]
  rows: number
  totalUnits: number
  totalBoxes: number
  headers: string[]
  warnings: string[]
}

export type CatalogFinance = {
  cost?: number
  sale?: number
}

export type CatalogResult = {
  financeByCode: Record<string, CatalogFinance>
  rows: number
  headers: string[]
  hasCost: boolean
  hasSalePrice: boolean
  warnings: string[]
}

export type TargetResult = {
  sellers: SellerTarget[]
  industryTarget: number
  industryPositiveTarget: number
  rows: number
  warnings: string[]
}

export type PremisesResult = {
  networkByCnpj: Record<string, string>
  rows: number
  networks: number
  warnings: string[]
}

export type HistoryResult = {
  byMonth: Record<string, Record<string, number>>
  rows: number
  warnings: string[]
}

type Matrix = unknown[][]

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

const STRATEGIC_NETWORKS = ['ABV', 'MEGA', 'PIRES', 'NOVA ESTRELA', 'PORTAL / PRINCESA'] as const

const ACTIVE_RCA_OLD_TO_CURRENT: Record<string, string> = {
  '130': '433',
  '135': '451',
  '211': '1059',
  '301': '444',
  '507': '416',
  '132': '431',
  '703': '1068',
  '704': '429',
  '705': '453',
  '707': '437',
  '708': '412',
  '709': '425',
  '710': '1063',
  '711': '450',
  '712': '1060',
  '714': '1065',
  '715': '442',
  '716': '445',
  '718': '441',
  '721': '1067',
  '757': '419',
  '759': '413',
  '800': '420',
  '706': '706',
  '752': '752',
}

const ACTIVE_CURRENT_CODES = new Set(Object.values(ACTIVE_RCA_OLD_TO_CURRENT))

function currentRcaCode(value: unknown) {
  const code = cleanId(value)
  if (!code) return ''
  return ACTIVE_RCA_OLD_TO_CURRENT[code] ?? (ACTIVE_CURRENT_CODES.has(code) ? code : '')
}

export function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

export function cleanId(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/^0+/, '') || '0'
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  let text = String(value).trim()
  if (!text) return 0
  text = text.replace(/R\$/gi, '').replace(/\s/g, '')
  const hasComma = text.includes(',')
  const hasDot = text.includes('.')
  if (hasComma && hasDot) text = text.replace(/\./g, '').replace(',', '.')
  else if (hasComma) text = text.replace(',', '.')
  text = text.replace(/[^0-9.-]/g, '')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : 0
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

async function readWorkbook(file: File) {
  const buffer = await file.arrayBuffer()
  return XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
}

function sheetMatrix(workbook: XLSX.WorkBook, sheetName?: string): Matrix {
  const selected = sheetName && workbook.Sheets[sheetName]
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]]
  if (!selected) return []
  return XLSX.utils.sheet_to_json(selected, { header: 1, defval: null, raw: true }) as Matrix
}

function headerIndex(rows: Matrix, markers: string[][], maxRows = 40) {
  let best = { index: -1, score: -1 }
  for (let r = 0; r < Math.min(maxRows, rows.length); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeText)
    let score = 0
    for (const group of markers) {
      if (headers.some(header => group.some(alias => header === normalizeText(alias) || header.includes(normalizeText(alias))))) score += 1
    }
    if (score > best.score) best = { index: r, score }
  }
  return best
}

function findColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeText)
  const wanted = aliases.map(normalizeText)
  let exact = normalized.findIndex(header => wanted.includes(header))
  if (exact >= 0) return exact
  return normalized.findIndex(header => wanted.some(alias => header.includes(alias)))
}

function findExactColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeText)
  const wanted = aliases.map(normalizeText)
  return normalized.findIndex(header => wanted.includes(header))
}

function valueAt(row: unknown[], index: number) {
  return index >= 0 ? row[index] : null
}

function inferStatusColumn(rows: Matrix, startRow: number) {
  let winner = -1
  let winnerScore = 0
  const width = Math.max(...rows.slice(startRow, startRow + 120).map(row => row.length), 0)
  for (let col = 0; col < width; col += 1) {
    let score = 0
    for (let r = startRow; r < Math.min(rows.length, startRow + 160); r += 1) {
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

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export async function parseSales(file: File): Promise<SalesResult> {
  const workbook = await readWorkbook(file)
  const rows = sheetMatrix(workbook)
  const match = headerIndex(rows, [
    ['DATA MOVIMENTO', 'DATA'],
    ['COD VENDEDOR'],
    ['VENDEDOR'],
    ['VALOR R NF', 'VALOR NF', 'VALOR'],
    ['NOME CLIENTE'],
  ], 60)
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

  if (dataCol < 0 || valueCol < 0) throw new Error('O 8022 não contém DATA MOVIMENTO e VALOR R$ NF em um formato reconhecido.')

  const datedRows: { row: unknown[]; date: Date }[] = []
  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const date = dateValue(valueAt(row, dataCol))
    if (date) datedRows.push({ row, date })
  }
  if (!datedRows.length) throw new Error('Não encontrei movimentos com data válida no 8022.')

  const maxDate = datedRows.reduce((max, item) => item.date > max ? item.date : max, datedRows[0].date)
  const year = maxDate.getFullYear()
  const month = maxDate.getMonth() + 1
  const days = new Date(year, month, 0).getDate()
  const daily = Array.from({ length: days }, () => 0)
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
    const value = numberValue(valueAt(row, valueCol))
    const status = statusCol >= 0 ? normalizeText(valueAt(row, statusCol)) : ''
    let eligible = false

    if (status.includes('A FATURAR')) {
      toInvoice += value
      eligible = true
      recognizedStatusRows += 1
    } else if (status === 'VENDA' || status.includes('FATURADO') || status.includes('VENDA FATURADA')) {
      billed += value
      eligible = true
      recognizedStatusRows += 1
    } else if (statusCol < 0) {
      billed += value
      eligible = true
    }
    if (!eligible) continue

    usedRows += 1
    daily[item.date.getDate() - 1] += value

    const rawSellerCode = cleanId(valueAt(row, sellerCodeCol)) || normalizeText(valueAt(row, sellerNameCol)) || 'SEM SETOR'
    const sellerName = String(valueAt(row, sellerNameCol) ?? '').trim() || `Setor ${rawSellerCode}`
    const cnpj = cleanId(valueAt(row, cnpjCol)) || cleanId(valueAt(row, clientCodeCol))

    const seller = sellerMap.get(rawSellerCode) ?? { name: sellerName, sellOut: 0, customers: new Set<string>() }
    seller.name = sellerName || seller.name
    seller.sellOut += value
    if (cnpj && value > 0) {
      seller.customers.add(cnpj)
      globalCustomers.add(cnpj)
      customerMap.set(cnpj, (customerMap.get(cnpj) ?? 0) + value)
    }
    sellerMap.set(rawSellerCode, seller)
  }

  if (statusCol >= 0 && recognizedStatusRows === 0) {
    warnings.push('A coluna STATUS PEDIDO foi localizada, mas nenhum status VENDA/A FATURAR foi reconhecido.')
  }
  if (cnpjCol < 0) warnings.push('Não encontrei CNPJ/CPF CLIENTE; a vinculação por rede está usando COD. CLIENTE como contingência.')

  const sellers = [...sellerMap.entries()]
    .map(([code, item]) => ({ code, name: item.name, sellOut: item.sellOut, positives: item.customers.size }))
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
    potentialPositives: globalCustomers.size,
    daily,
    sellers,
    customers,
    rows: usedRows,
    headers: headers.map(value => String(value ?? '')).filter(Boolean),
    warnings,
  }
}

export async function parseBussola(file: File): Promise<TargetResult> {
  const workbook = await readWorkbook(file)
  if (!workbook.Sheets.Metas) throw new Error('A planilha Bússola não contém a aba "Metas".')
  const rows = sheetMatrix(workbook, 'Metas')
  const match = headerIndex(rows, [
    ['INDUSTRIA'], ['META PNA'], ['META POS IND'], ['NOME'], ['ST', 'SETOR'],
  ], 15)
  if (match.index < 0 || match.score < 4) throw new Error('Não consegui reconhecer o cabeçalho da aba Metas da Bússola.')

  const headers = rows[match.index] ?? []
  const codeCol = findColumn(headers, ['ST', 'SETOR'])
  const nameCol = findColumn(headers, ['NOME'])
  const industryCol = findColumn(headers, ['INDÚSTRIA', 'INDUSTRIA'])
  const targetCol = findColumn(headers, ['META PNA'])
  const positiveCol = findColumn(headers, ['META. POS. IND.', 'META POS IND', 'META POS IND.'])
  if ([codeCol, nameCol, industryCol, targetCol].some(index => index < 0)) throw new Error('Faltam colunas essenciais na aba Metas da Bússola.')

  const sellers = new Map<string, SellerTarget>()
  let matchedRows = 0
  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    if (!normalizeText(valueAt(row, industryCol)).includes('COLGATE')) continue
    const code = cleanId(valueAt(row, codeCol))
    if (!code) continue
    const name = String(valueAt(row, nameCol) ?? '').trim() || `Setor ${code}`
    const current = sellers.get(code) ?? { code, name, target: 0, positiveTarget: 0 }
    current.name = name
    current.target += numberValue(valueAt(row, targetCol))
    current.positiveTarget += numberValue(valueAt(row, positiveCol))
    sellers.set(code, current)
    matchedRows += 1
  }

  const list = [...sellers.values()].sort((a, b) => Number(a.code) - Number(b.code))
  const industryTarget = list.reduce((sum, seller) => sum + seller.target, 0)
  const industryPositiveTarget = list.reduce((sum, seller) => sum + seller.positiveTarget, 0)
  const warnings: string[] = []
  if (!list.length) warnings.push('Nenhuma linha da indústria Colgate foi encontrada na aba Metas.')
  return { sellers: list, industryTarget, industryPositiveTarget, rows: matchedRows, warnings }
}

export async function parsePremises(file: File): Promise<PremisesResult> {
  const workbook = await readWorkbook(file)
  const rows = sheetMatrix(workbook)
  const match = headerIndex(rows, [['COD CLIENTE'], ['NOME CLIENTE'], ['REDE'], ['AMBIENTE']], 15)
  if (match.index < 0 || match.score < 3) throw new Error('Não consegui reconhecer a Base de Premissas Q3.')

  const headers = rows[match.index] ?? []
  const cnpjCol = findColumn(headers, ['COD CLIENTE'])
  const networkCol = findColumn(headers, ['REDE'])
  if (cnpjCol < 0 || networkCol < 0) throw new Error('A Base de Premissas precisa das colunas COD CLIENTE e REDE.')

  const networkByCnpj: Record<string, string> = {}
  const names = new Set<string>()
  let used = 0

  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const cnpj = cleanId(valueAt(row, cnpjCol))
    const rawNetwork = String(valueAt(row, networkCol) ?? '').trim()
    if (!cnpj || !rawNetwork) continue
    const network = networkDisplay(rawNetwork)
    networkByCnpj[cnpj] = network
    names.add(network)
    used += 1
  }

  return {
    networkByCnpj,
    rows: used,
    networks: names.size,
    warnings: [],
  }
}

export function networkDisplay(raw: string) {
  const normalized = normalizeText(raw)
  if (normalized.includes('ABV')) return 'ABV'
  if (normalized.includes('VRA') || normalized.includes('MEGA')) return 'MEGA'
  if (normalized.includes('PIRES')) return 'PIRES'
  if (normalized.includes('NOVA ESTRELA')) return 'NOVA ESTRELA'
  if (normalized.includes('PORTAL') || normalized.includes('PRINCESA')) return 'PORTAL / PRINCESA'
  return raw.replace(/^\s*REDE\s+/i, '').trim()
}

function classifyStock(description: string) {
  const d = normalizeText(description)
  if (/^CD\b/.test(d)) return { line: 'Creme Dental', rule: 'Descrição inicia com “CD”' }
  if (/^SAB\b/.test(d)) return { line: 'Sabonetes', rule: 'Descrição inicia com “SAB”' }
  if (/^(SH|COND|CR PENT|KIT SH)\b/.test(d)) return { line: 'Hair', rule: 'Prefixos SH / COND / CR PENT / KIT SH' }
  if (/^(ED|ENX|ENXAG|FITA DENT|FIO|GD)\b/.test(d)) return { line: 'Esc + Enx + Fio', rule: 'Prefixos ED / ENX / FITA DENT / FIO / GD' }
  if (/^(PINHO SOL|LIMP|LAVA ROUPA|AJAX|DESINF|DESENG)\b/.test(d)) return { line: 'Limpeza', rule: 'Prefixos PINHO SOL / LIMP / LAVA ROUPA / AJAX / DESINF / DESENG' }
  return { line: 'Outros', rule: 'Sem correspondência nos prefixos provisórios' }
}

export async function parseStock(file: File): Promise<StockResult> {
  const workbook = await readWorkbook(file)
  const rows = sheetMatrix(workbook)
  const match = headerIndex(rows, [
    ['DESCRICAO DO PRODUTO', 'DESCRI'], ['ESTOQUE EM UND'], ['ESTOQUE EM CX'], ['CATEGORIA'],
  ], 60)
  if (match.index < 0 || match.score < 2) throw new Error('Não consegui reconhecer o cabeçalho do relatório 8013.')

  const headers = rows[match.index] ?? []
  const descriptionCol = findColumn(headers, ['DESCRIÇÃO DO PRODUTO', 'DESCRICAO DO PRODUTO', 'DESCRIÇÃO', 'DESCRI'])
  const unitsCol = findColumn(headers, ['ESTOQUE EM UND.', 'ESTOQUE EM UND', 'ESTOQUE UND'])
  const boxesCol = findColumn(headers, ['ESTOQUE EM CX', 'ESTOQUE CX'])
  const categoryCol = findColumn(headers, ['CATEGORIA'])
  const codeCol = findColumn(headers, ['CODPROD. WINTHOR', 'COD PRODUTO', 'CÓDIGO PRODUTO', 'CODIGO PRODUTO', 'COD. PRODUTO', 'CÓDIGO', 'CODIGO'])
  if (descriptionCol < 0 || unitsCol < 0) throw new Error('O 8013 precisa conter descrição e ESTOQUE EM UND.')

  const items: StockItem[] = []
  let totalUnits = 0
  let totalBoxes = 0

  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const description = String(valueAt(row, descriptionCol) ?? '').trim()
    if (!description) continue
    const units = numberValue(valueAt(row, unitsCol))
    const boxes = numberValue(valueAt(row, boxesCol))
    if (units === 0 && boxes === 0) continue

    const code = cleanId(valueAt(row, codeCol))
    const category = String(valueAt(row, categoryCol) ?? '').trim()
    const classification = classifyStock(description)

    items.push({ code, description, category, units, boxes, ...classification })
    totalUnits += units
    totalBoxes += boxes
  }

  return {
    items,
    rows: items.length,
    totalUnits,
    totalBoxes,
    headers: headers.map(value => String(value ?? '')).filter(Boolean),
    warnings: ['A classificação por linha continua provisória; ela permanece explícita até definirmos um campo oficial de linha/categoria.'],
  }
}

function parsePosition105(rows: Matrix): CatalogResult | null {
  const match = headerIndex(rows, [
    ['QT EST'], ['CODIGO', 'COD'], ['DESCRI'], ['REAL ICMS'], ['P VENDA'], ['PR COMP'],
  ], 80)
  if (match.index < 0 || match.score < 4) return null

  const headers = rows[match.index] ?? []
  const codeCol = findColumn(headers, ['CÓDIGO', 'CODIGO', 'CÓD.', 'COD'])
  const costCol = findExactColumn(headers, ['REAL'])
  const saleCol = findExactColumn(headers, ['P VENDA', 'P. VENDA'])
  if (codeCol < 0) return null

  const financeByCode: Record<string, CatalogFinance> = {}
  let used = 0

  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const code = cleanId(valueAt(row, codeCol))
    if (!code) continue

    const cost = costCol >= 0 ? numberValue(valueAt(row, costCol)) : undefined
    const sale = saleCol >= 0 ? numberValue(valueAt(row, saleCol)) : undefined
    if (cost == null && sale == null) continue

    financeByCode[code] = { cost, sale }
    used += 1
  }

  return {
    financeByCode,
    rows: used,
    headers: headers.map(value => String(value ?? '')).filter(Boolean),
    hasCost: costCol >= 0,
    hasSalePrice: saleCol >= 0,
    warnings: [
      'Relatório 105 reconhecido como fonte financeira do estoque.',
      'O painel está usando provisoriamente a coluna “Real” como custo unitário e “P. Venda” como preço de venda; confirme se “Estoque ao custo” deve usar Real, Real+ICMS, Financ. ou Pr. Comp.',
    ],
  }
}

export async function parseCatalog(file: File): Promise<CatalogResult> {
  const workbook = await readWorkbook(file)
  const rows = sheetMatrix(workbook)

  const position105 = parsePosition105(rows)
  if (position105) return position105

  const match = headerIndex(rows, [['CODIGO', 'COD'], ['DESCRI'], ['CLASSE'], ['EMB']], 80)
  if (match.index < 0 || match.score < 2) throw new Error('Não consegui reconhecer este arquivo como cadastro 286 nem como posição de estoque 105.')

  const headers = rows[match.index] ?? []
  const codeCol = findColumn(headers, ['CÓDIGO', 'CODIGO', 'CÓD.', 'COD'])
  const costCol = findColumn(headers, ['CUSTO', 'CUSTO REAL', 'CUSTO CONTABIL', 'CUSTO FINANCEIRO', 'CUSTO ULT ENTRADA'])
  const saleCol = findColumn(headers, ['PREÇO VENDA', 'PRECO VENDA', 'PVENDA', 'PREÇO', 'PRECO'])
  const financeByCode: Record<string, CatalogFinance> = {}
  let used = 0

  if (codeCol >= 0) {
    for (let r = match.index + 1; r < rows.length; r += 1) {
      const code = cleanId(valueAt(rows[r] ?? [], codeCol))
      if (!code) continue
      financeByCode[code] = {
        cost: costCol >= 0 ? numberValue(valueAt(rows[r] ?? [], costCol)) : undefined,
        sale: saleCol >= 0 ? numberValue(valueAt(rows[r] ?? [], saleCol)) : undefined,
      }
      used += 1
    }
  }

  const warnings: string[] = []
  if (costCol < 0) warnings.push('O cadastro 286 não apresentou uma coluna de custo reconhecível. O relatório 105 é uma fonte melhor para a posição financeira do estoque.')
  if (saleCol < 0) warnings.push('O cadastro 286 não apresentou uma coluna de preço de venda reconhecível.')

  return {
    financeByCode,
    rows: used,
    headers: headers.map(value => String(value ?? '')).filter(Boolean),
    hasCost: costCol >= 0,
    hasSalePrice: saleCol >= 0,
    warnings,
  }
}

export async function parseHistory379(file: File): Promise<HistoryResult> {
  const text = await file.text()
  const lines = text.split(/\r\n|\n|\r/)
  const header = lines.find(line => line.includes('Data') && line.includes('Valor') && line.includes('Cliente') && line.includes('RPC.'))
  if (!header) throw new Error('Não consegui localizar o cabeçalho fixo do relatório 379.')

  const valueStart = header.indexOf('Valor')
  const discountStart = header.indexOf('Desconto')
  const clientStart = header.indexOf('Cliente')
  const rpcStart = header.indexOf('RPC.')
  if ([valueStart, discountStart, clientStart, rpcStart].some(index => index < 0)) throw new Error('O layout do 379 não corresponde ao esperado.')

  const byMonth: Record<string, Record<string, number>> = {}
  let used = 0

  for (const line of lines) {
    const match = line.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})/)
    if (!match) continue
    const day = Number(match[1])
    const month = Number(match[2])
    const year = Number(match[3])
    if (!day || !month || !year) continue

    const value = numberValue(line.slice(valueStart, discountStart))
    const cnpj = cleanId(line.slice(clientStart, rpcStart))
    if (!cnpj) continue

    const key = monthKey(year, month)
    byMonth[key] ??= {}
    byMonth[key][cnpj] = (byMonth[key][cnpj] ?? 0) + value
    used += 1
  }

  return {
    byMonth,
    rows: used,
    warnings: ['Histórico 379 agregado pelo campo Valor. Operações/devoluções ainda precisam ser validadas antes de tratarmos esse comparativo como fechamento oficial.'],
  }
}

export function mergeSellers(targets: SellerTarget[], sales: SellerSales[]) {
  const actualByCurrent = new Map<string, SellerSales>()

  for (const actual of sales) {
    const currentCode = currentRcaCode(actual.code)
    if (!currentCode) continue
    const stored = actualByCurrent.get(currentCode)
    if (stored) {
      stored.sellOut += actual.sellOut
      stored.positives += actual.positives
      if (!stored.name && actual.name) stored.name = actual.name
    } else {
      actualByCurrent.set(currentCode, { ...actual, code: currentCode })
    }
  }

  const merged: { code: string; name: string; target: number; sellOut: number; positives: number; positiveTarget: number }[] = []
  const used = new Set<string>()

  for (const target of targets) {
    const currentCode = currentRcaCode(target.code)
    if (!currentCode) continue
    const actual = actualByCurrent.get(currentCode)
    const existing = merged.find(item => item.code === currentCode)
    if (existing) {
      existing.target += target.target
      existing.positiveTarget += target.positiveTarget
      continue
    }

    merged.push({
      code: currentCode,
      name: target.name || actual?.name || `RCA ${currentCode}`,
      target: target.target,
      sellOut: actual?.sellOut ?? 0,
      positives: actual?.positives ?? 0,
      positiveTarget: target.positiveTarget,
    })
    used.add(currentCode)
  }

  for (const [currentCode, actual] of actualByCurrent.entries()) {
    if (used.has(currentCode)) continue
    merged.push({
      code: currentCode,
      name: actual.name,
      target: 0,
      sellOut: actual.sellOut,
      positives: actual.positives,
      positiveTarget: 0,
    })
  }

  return merged.sort((a, b) => b.sellOut - a.sellOut || collator.compare(a.name, b.name))
}

export function stockFinancial(items: StockItem[], finance: Record<string, CatalogFinance>) {
  const lines = new Map<string, {
    name: string
    cost: number
    sale: number
    units: number
    boxes: number
    matched: number
    total: number
    rules: Set<string>
  }>()

  let matchedItems = 0

  for (const item of items) {
    const row = lines.get(item.line) ?? {
      name: item.line,
      cost: 0,
      sale: 0,
      units: 0,
      boxes: 0,
      matched: 0,
      total: 0,
      rules: new Set<string>(),
    }

    row.units += item.units
    row.boxes += item.boxes
    row.total += 1
    row.rules.add(item.rule)

    const f = item.code ? finance[item.code] : undefined
    if (f && (f.cost != null || f.sale != null)) {
      row.matched += 1
      matchedItems += 1
      if (f.cost != null) row.cost += item.units * f.cost
      if (f.sale != null) row.sale += item.units * f.sale
    }

    lines.set(item.line, row)
  }

  const list = [...lines.values()].map(row => ({
    name: row.name,
    cost: row.cost,
    sale: row.sale,
    units: row.units,
    boxes: row.boxes,
    matched: row.matched,
    total: row.total,
    rule: [...row.rules].join(' • '),
  }))

  return {
    lines: list,
    totalCost: list.reduce((sum, row) => sum + row.cost, 0),
    totalSale: list.reduce((sum, row) => sum + row.sale, 0),
    matchedItems,
  }
}

export function buildNetworks(
  customers: CustomerSales[],
  networkByCnpj: Record<string, string>,
  previousByCnpj: Record<string, number> | undefined,
  poolTarget: number,
) {
  const map = new Map<string, { name: string; sellOut: number; previous: number }>(
    STRATEGIC_NETWORKS.map(name => [name, { name, sellOut: 0, previous: 0 }]),
  )

  for (const customer of customers) {
    const network = networkByCnpj[cleanId(customer.cnpj)]
    if (!network || !STRATEGIC_NETWORKS.includes(network as typeof STRATEGIC_NETWORKS[number])) continue
    const row = map.get(network)!
    row.sellOut += customer.value
  }

  if (previousByCnpj) {
    for (const [cnpj, value] of Object.entries(previousByCnpj)) {
      const network = networkByCnpj[cleanId(cnpj)]
      if (!network || !STRATEGIC_NETWORKS.includes(network as typeof STRATEGIC_NETWORKS[number])) continue
      const row = map.get(network)!
      row.previous += value
    }
  }

  const rows = STRATEGIC_NETWORKS.map(name => map.get(name)!)
  const total = rows.reduce((sum, row) => sum + row.sellOut, 0)

  return rows.map(row => ({
    ...row,
    target: total > 0 ? poolTarget * row.sellOut / total : (poolTarget > 0 ? poolTarget / rows.length : 0),
  }))
}
