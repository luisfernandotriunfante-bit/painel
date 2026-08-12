import * as XLSX from 'xlsx'
import { normalizeText } from './data'

export type TransitResult = {
  totalValue: number
  rows: number
  orders: number
  valueSource: string
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

function candidateHeader(rows: Matrix) {
  let bestIndex = -1
  let bestScore = -1
  for (let r = 0; r < Math.min(rows.length, 100); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeText)
    let score = 0
    if (headers.some(h => ['PEDIDO', 'NUM PEDIDO', 'NUMERO PEDIDO', 'N PEDIDO'].includes(h))) score += 1
    if (headers.some(h => ['VALOR ITEM', 'VALOR TOTAL ITEM', 'VLR ITEM', 'TOTAL ITEM'].includes(h))) score += 3
    if (headers.some(h => ['VALOR PEDIDO', 'TOTAL PEDIDO', 'VLR PEDIDO'].includes(h))) score += 3
    if (headers.some(h => ['VALOR TOTAL', 'TOTAL', 'VLR TOTAL'].includes(h))) score += 1
    if (headers.some(h => h.includes('PROD') || h.includes('DESCRI'))) score += 1
    if (score > bestScore) {
      bestScore = score
      bestIndex = r
    }
  }
  return { index: bestIndex, score: bestScore }
}

function grandTotalFromRows(rows: Matrix) {
  for (let r = rows.length - 1; r >= 0; r -= 1) {
    const row = rows[r] ?? []
    const labelIndex = row.findIndex(cell => /^TOTAL(?:\s+GERAL)?$/i.test(String(cell ?? '').trim()))
    if (labelIndex < 0) continue
    const numeric = row.slice(labelIndex + 1).map(numberValue).filter(value => value !== 0)
    if (numeric.length === 1) return numeric[0]
  }
  return null
}

export async function parseTransitPortfolio(file: File): Promise<TransitResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })

  let best: { rows: Matrix; header: number; score: number; sheet: string } | null = null
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
    const match = candidateHeader(rows)
    if (!best || match.score > best.score) best = { rows, header: match.index, score: match.score, sheet: sheetName }
  }
  if (!best || best.header < 0 || best.score < 2) throw new Error('Não consegui reconhecer com segurança o layout da Carteira Colgate. Envie esse arquivo no chat para eu mapear as colunas exatas.')

  const rows = best.rows
  const headers = rows[best.header] ?? []
  const orderCol = findExact(headers, ['PEDIDO', 'N PEDIDO', 'NUM PEDIDO', 'NUMERO PEDIDO'])
  const itemValueCol = findExact(headers, ['VALOR ITEM', 'VALOR TOTAL ITEM', 'VLR ITEM', 'TOTAL ITEM', 'VALOR LIQUIDO ITEM'])
  const orderValueCol = findExact(headers, ['VALOR PEDIDO', 'TOTAL PEDIDO', 'VLR PEDIDO', 'VALOR LIQUIDO PEDIDO'])

  let totalValue = 0
  let usedRows = 0
  const orders = new Set<string>()
  let valueSource = ''

  if (itemValueCol >= 0) {
    valueSource = String(headers[itemValueCol] ?? 'Valor item')
    for (let r = best.header + 1; r < rows.length; r += 1) {
      const value = numberValue(rows[r]?.[itemValueCol])
      if (!value) continue
      totalValue += value
      usedRows += 1
      if (orderCol >= 0) {
        const order = String(rows[r]?.[orderCol] ?? '').trim()
        if (order) orders.add(order)
      }
    }
  } else if (orderValueCol >= 0 && orderCol >= 0) {
    valueSource = String(headers[orderValueCol] ?? 'Valor pedido')
    const valueByOrder = new Map<string, number>()
    for (let r = best.header + 1; r < rows.length; r += 1) {
      const order = String(rows[r]?.[orderCol] ?? '').trim()
      const value = numberValue(rows[r]?.[orderValueCol])
      if (!order || !value) continue
      if (!valueByOrder.has(order)) valueByOrder.set(order, value)
    }
    totalValue = [...valueByOrder.values()].reduce((sum, value) => sum + value, 0)
    usedRows = valueByOrder.size
    valueByOrder.forEach((_, order) => orders.add(order))
  } else {
    const total = grandTotalFromRows(rows)
    if (total == null) throw new Error('A Carteira foi aberta, mas não encontrei uma coluna inequívoca de Valor do Item/Valor do Pedido nem um Total Geral único. Não vou somar uma coluna por aproximação.')
    totalValue = total
    usedRows = 1
    valueSource = 'Total geral identificado no arquivo'
  }

  if (!Number.isFinite(totalValue) || totalValue <= 0) throw new Error('A Carteira foi reconhecida, mas o valor em trânsito calculado ficou zerado. Envie o arquivo no chat para validar o layout.')

  return {
    totalValue,
    rows: usedRows,
    orders: orders.size,
    valueSource,
    warnings: [
      `Carteira Colgate: ${valueSource} usada como valor do abastecimento em trânsito.`,
      'O preço de venda continua considerando somente o estoque físico do relatório 105; a carteira não é adicionada ao estoque a preço de venda.',
    ],
  }
}
