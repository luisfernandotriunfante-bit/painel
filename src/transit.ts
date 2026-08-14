import * as XLSX from 'xlsx'
import { cleanId, normalizeText } from './data'
import { TRANSIT_DETAIL_KEY, TRANSIT_DIAGNOSTIC_KEY } from './transitValuation'

export type TransitResult = {
  totalValue: number
  valueByCode: Record<string, number>
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

function findMaterialColumn(headers: unknown[]) {
  const normalized = headers.map(normalizeText)
  const exactAliases = [
    'MATERIAL', 'MATERIAL NUMBER', 'MATERIAL NO', 'MATERIAL CODE',
    'PRODUTO', 'COD PRODUTO', 'CODIGO PRODUTO', 'COD. PRODUTO',
    'COD MATERIAL', 'CODIGO MATERIAL', 'SKU', 'COD SKU', 'ITEM CODE',
  ].map(normalizeText)
  const exact = normalized.findIndex(header => exactAliases.includes(header))
  if (exact >= 0) return exact

  return normalized.findIndex(header => {
    if (!header) return false
    if (header.includes('DESCR') || header.includes('DESCRIPTION')) return false
    if (header === 'ITEM') return true
    if (header.includes('SKU')) return true
    if (header.includes('MATERIAL') && (header.includes('COD') || header.includes('CODE') || header.includes('NUMBER') || header.includes('NO'))) return true
    if (header.includes('PRODUTO') && (header.includes('COD') || header.includes('CODE') || header.includes('NUMBER'))) return true
    return false
  })
}

function candidateHeader(rows: Matrix) {
  let bestIndex = -1
  let bestScore = -1
  for (let r = 0; r < Math.min(rows.length, 100); r += 1) {
    const headers = rows[r] ?? []
    const normalized = headers.map(normalizeText)
    let score = 0
    if (normalized.some(h => ['PEDIDO', 'NUM PEDIDO', 'NUMERO PEDIDO', 'N PEDIDO', 'ORDER NUMBER'].includes(h))) score += 2
    if (normalized.some(h => ['NET VALUE ZINV', 'VALOR ITEM', 'VALOR TOTAL ITEM', 'VLR ITEM', 'TOTAL ITEM'].includes(h))) score += 4
    if (normalized.some(h => ['VALOR PEDIDO', 'TOTAL PEDIDO', 'VLR PEDIDO'].includes(h))) score += 3
    if (findMaterialColumn(headers) >= 0) score += 2
    if (normalized.some(h => h === 'DESCRIPTION' || h.includes('DESCRI'))) score += 1
    if (normalized.some(h => ['ORDER QTY', 'QTD PEDIDO', 'QTDE PEDIDO'].includes(h))) score += 1
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
  if (!best || best.header < 0 || best.score < 3) throw new Error('Não consegui reconhecer com segurança o layout da Carteira Colgate.')

  const rows = best.rows
  const headers = rows[best.header] ?? []
  const orderCol = findExact(headers, ['ORDER NUMBER', 'PEDIDO', 'N PEDIDO', 'NUM PEDIDO', 'NUMERO PEDIDO'])
  const materialCol = findMaterialColumn(headers)
  const itemValueCol = findExact(headers, ['NET VALUE ( ZINV )', 'NET VALUE ZINV', 'VALOR ITEM', 'VALOR TOTAL ITEM', 'VLR ITEM', 'TOTAL ITEM', 'VALOR LIQUIDO ITEM'])
  const orderValueCol = findExact(headers, ['VALOR PEDIDO', 'TOTAL PEDIDO', 'VLR PEDIDO', 'VALOR LIQUIDO PEDIDO'])

  let totalValue = 0
  let usedRows = 0
  const orders = new Set<string>()
  const valueByCode: Record<string, number> = {}
  let rowsWithoutCode = 0
  let valueWithoutCode = 0
  let valueSource = ''

  if (itemValueCol >= 0) {
    valueSource = String(headers[itemValueCol] ?? 'Net Value ( ZINV )')
    for (let r = best.header + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? []
      const value = numberValue(row[itemValueCol])
      const order = orderCol >= 0 ? String(row[orderCol] ?? '').trim() : ''
      const code = materialCol >= 0 ? cleanId(row[materialCol]) : ''
      if (!value && !order) continue
      if (value) {
        totalValue += value
        usedRows += 1
        if (code) valueByCode[code] = (valueByCode[code] ?? 0) + value
        else {
          rowsWithoutCode += 1
          valueWithoutCode += value
        }
      }
      if (order) orders.add(order)
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
    if (total == null) throw new Error('A Carteira foi aberta, mas não encontrei uma coluna de valor reconhecida.')
    totalValue = total
    usedRows = 1
    valueSource = 'Total geral identificado no arquivo'
  }

  if (!Number.isFinite(totalValue) || totalValue <= 0) throw new Error('A Carteira foi reconhecida, mas o valor em trânsito calculado ficou zerado.')

  const codedValue = Object.values(valueByCode).reduce((sum, value) => sum + value, 0)
  const diagnostic = {
    materialHeader: materialCol >= 0 ? String(headers[materialCol] ?? '') : 'NÃO IDENTIFICADA',
    valueHeader: itemValueCol >= 0 ? String(headers[itemValueCol] ?? '') : valueSource,
    identifiedSkus: Object.keys(valueByCode).length,
    codedValue,
    rowsWithoutCode,
    valueWithoutCode,
    sampleTransitCodes: Object.keys(valueByCode).slice(0, 8),
  }
  try {
    localStorage.setItem(TRANSIT_DETAIL_KEY, JSON.stringify(valueByCode))
    localStorage.setItem(TRANSIT_DIAGNOSTIC_KEY, JSON.stringify(diagnostic))
  } catch { /* detalhe opcional para valoração */ }

  const warnings = [
    `Carteira Colgate: ${valueSource} usada como valor do abastecimento em trânsito no bloco de custo.`,
    'Regra validada para CARTEIRA 08.08: somar Net Value ( ZINV ) linha a linha.',
    `Carteira: coluna de material identificada como “${diagnostic.materialHeader}”.`,
  ]
  if (codedValue > 0) warnings.push(`Carteira: ${Object.keys(valueByCode).length} SKUs identificados para cruzamento com Real/P. Venda do 105.`)
  else warnings.push('Carteira: nenhum SKU foi preservado. Revise a coluna de material identificada na auditoria.')
  if (rowsWithoutCode) warnings.push(`Carteira: ${rowsWithoutCode} linhas (${valueWithoutCode.toFixed(2)}) ficaram sem código de material e não poderão ser valoradas a preço de venda pelo 105.`)

  return {
    totalValue,
    valueByCode,
    rows: usedRows,
    orders: orders.size,
    valueSource,
    warnings,
  }
}
