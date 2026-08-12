import * as XLSX from 'xlsx'
import { CatalogFinance, cleanId, normalizeText } from './data'

export type Position105Result = {
  financeByCode: Record<string, CatalogFinance>
  totalCost: number
  totalSale: number
  totalUnits: number
  rows: number
  headers: string[]
  warnings: string[]
}

type Matrix = unknown[][]

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

function findExact(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeText)
  const wanted = aliases.map(normalizeText)
  return normalized.findIndex(header => wanted.includes(header))
}

function findHeader(rows: Matrix) {
  let bestIndex = -1
  let bestScore = -1
  for (let r = 0; r < Math.min(rows.length, 120); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeText)
    let score = 0
    if (headers.some(h => ['QT EST', 'QT ESTOQUE', 'QTDE EST', 'QTDE ESTOQUE'].includes(h))) score += 1
    if (headers.some(h => ['CODIGO', 'COD', 'COD PRODUTO', 'CODPROD'].includes(h))) score += 1
    if (headers.includes('REAL')) score += 1
    if (headers.some(h => ['P VENDA', 'PVENDA', 'PRECO VENDA'].includes(h))) score += 1
    if (headers.some(h => h.includes('DESCRI'))) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = r
    }
  }
  return { index: bestIndex, score: bestScore }
}

export async function parsePosition105Totals(file: File): Promise<Position105Result> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('O relatório 105 não possui uma planilha legível.')

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
  const match = findHeader(rows)
  if (match.index < 0 || match.score < 3) throw new Error('Não consegui reconhecer as colunas da posição 105.')

  const headers = rows[match.index] ?? []
  const qtyCol = findExact(headers, ['QT EST', 'QT. EST.', 'QT.EST.', 'QT ESTOQUE', 'QTDE EST', 'QTDE ESTOQUE'])
  let codeCol = findExact(headers, ['CÓDIGO', 'CODIGO', 'COD.', 'COD', 'COD PRODUTO', 'CODPROD'])
  const costCol = findExact(headers, ['REAL'])
  const saleCol = findExact(headers, ['P. VENDA', 'P VENDA', 'PVENDA', 'PREÇO VENDA', 'PRECO VENDA'])

  if (codeCol < 0) {
    const normalized = headers.map(normalizeText)
    codeCol = normalized.findIndex(header => header === 'CODIGO PRODUTO' || header === 'COD PRODUTO')
  }
  if (qtyCol < 0 || costCol < 0 || saleCol < 0) {
    throw new Error('O 105 precisa conter Qt.Est., Real e P. Venda para calcular a posição financeira.')
  }

  const financeByCode: Record<string, CatalogFinance> = {}
  let totalCost = 0
  let totalSale = 0
  let totalUnits = 0
  let used = 0

  for (let r = match.index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const units = numberValue(row[qtyCol])
    const cost = numberValue(row[costCol])
    const sale = numberValue(row[saleCol])
    const code = codeCol >= 0 ? cleanId(row[codeCol]) : ''

    if (!units && !cost && !sale && !code) continue
    totalUnits += units
    totalCost += units * cost
    totalSale += units * sale
    if (code) financeByCode[code] = { cost, sale }
    used += 1
  }

  if (!used) throw new Error('O relatório 105 foi reconhecido, mas nenhuma linha de posição foi encontrada.')

  return {
    financeByCode,
    totalCost,
    totalSale,
    totalUnits,
    rows: used,
    headers: headers.map(value => String(value ?? '')).filter(Boolean),
    warnings: [
      'Regra financeira definida: Estoque ao custo = Qt.Est. × Real.',
      'Estoque a preço de venda = Qt.Est. × P. Venda.',
      'Os totais financeiros são calculados diretamente no 105 e não dependem do casamento com o 8013.',
    ],
  }
}
