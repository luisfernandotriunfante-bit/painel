import * as XLSX from 'xlsx'
import { CatalogFinance, cleanId, normalizeText } from './data'

export type Position105Result = {
  financeByCode: Record<string, CatalogFinance>
  totalCost: number
  totalSale: number
  totalUnits: number
  rows: number
  priceRows: number
  headers: string[]
  warnings: string[]
}

type Matrix = unknown[][]

type HeaderMatch = {
  sheetName: string
  rows: Matrix
  index: number
  headers: unknown[]
  qtyCol: number
  codeCol: number
  costCol: number
  saleCol: number
  descriptionCol: number
  score: number
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

function findColumn(headers: unknown[], matcher: (header: string) => boolean) {
  return headers.map(normalizeText).findIndex(matcher)
}

function locateHeader(workbook: XLSX.WorkBook): HeaderMatch | null {
  let best: HeaderMatch | null = null

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix

    for (let r = 0; r < Math.min(rows.length, 220); r += 1) {
      const headers = rows[r] ?? []
      const normalized = headers.map(normalizeText)

      const qtyCol = findColumn(headers, h =>
        h === 'QT EST' || h === 'QT ESTOQUE' || h === 'QTDE EST' || h === 'QTDE ESTOQUE' ||
        (h.includes('QT') && h.includes('EST') && !h.includes('VALOR')),
      )
      const codeCol = findColumn(headers, h =>
        h === 'CODIGO' || h === 'COD' || h === 'COD PRODUTO' || h === 'CODIGO PRODUTO' || h === 'CODPROD' ||
        (h.includes('COD') && h.includes('PROD')),
      )
      const costCol = findColumn(headers, h => h === 'REAL' || h === 'CUSTO REAL')
      const saleCol = findColumn(headers, h =>
        h === 'P VENDA' || h === 'PVENDA' || h === 'PRECO VENDA' || h === 'PRECO DE VENDA' ||
        (h.includes('VENDA') && (h.startsWith('P ') || h.includes('PRECO'))),
      )
      const descriptionCol = findColumn(headers, h => h.includes('DESCRI'))

      let score = 0
      if (qtyCol >= 0) score += 3
      if (costCol >= 0) score += 3
      if (saleCol >= 0) score += 3
      if (codeCol >= 0) score += 1
      if (descriptionCol >= 0) score += 1
      if (normalized.some(h => h.includes('REAL ICMS'))) score += 0.2

      const candidate: HeaderMatch = { sheetName, rows, index: r, headers, qtyCol, codeCol, costCol, saleCol, descriptionCol, score }
      if (!best || candidate.score > best.score) best = candidate
    }
  }

  return best && best.qtyCol >= 0 && best.costCol >= 0 && best.saleCol >= 0 ? best : null
}

function isTotalRow(row: unknown[]) {
  return row.some(value => {
    const text = normalizeText(value)
    return text.startsWith('TOTAL') || text.includes('TOTAL GERAL') || text.includes('TOTAL ESTOQUE')
  })
}

function metadataValue(rows: Matrix, endRow: number, label: string) {
  const wanted = normalizeText(label)
  for (let r = 0; r < Math.min(endRow, rows.length); r += 1) {
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c += 1) {
      if (normalizeText(row[c]) !== wanted) continue
      for (let cc = c + 1; cc < row.length; cc += 1) {
        const value = String(row[cc] ?? '').trim()
        if (value) return value
      }
    }
  }
  return ''
}

export async function parsePosition105Totals(file: File): Promise<Position105Result> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  const match = locateHeader(workbook)
  if (!match) {
    throw new Error('Não consegui localizar no 105 as colunas Qt.Est., Real e P. Venda. Se o arquivo estiver correto, envie-o aqui para eu ajustar o layout exato.')
  }

  const consideredRaw = metadataValue(match.rows, match.index, 'Considerado:')
  const considered = normalizeText(consideredRaw)
  if (considered && !considered.includes('FISICO')) {
    throw new Error(`Este 105 foi gerado como “${consideredRaw}”. Para o estoque oficial, gere o relatório 105 com “Considerado: Físico”.`)
  }

  const branch = metadataValue(match.rows, match.index, 'Filial:')
  const stockDate = metadataValue(match.rows, match.index, 'Estoque em:')

  const financeByCode: Record<string, CatalogFinance> = {}
  let totalCost = 0
  let totalSale = 0
  let totalUnits = 0
  let used = 0
  let priceRows = 0

  for (let r = match.index + 1; r < match.rows.length; r += 1) {
    const row = match.rows[r] ?? []
    if (!row.length || isTotalRow(row)) continue

    const units = numberValue(row[match.qtyCol])
    const cost = numberValue(row[match.costCol])
    const sale = numberValue(row[match.saleCol])
    const code = match.codeCol >= 0 ? cleanId(row[match.codeCol]) : ''
    const description = match.descriptionCol >= 0 ? String(row[match.descriptionCol] ?? '').trim() : ''

    if (!units && !cost && !sale && !code && !description) continue
    if (normalizeText(row[match.qtyCol]) === 'QT EST' || normalizeText(row[match.costCol]) === 'REAL') continue

    if (code && (cost !== 0 || sale !== 0)) {
      financeByCode[code] = { cost, sale }
      priceRows += 1
    }

    if (units === 0) continue
    totalUnits += units
    totalCost += units * cost
    totalSale += units * sale
    used += 1
  }

  if (!used) {
    throw new Error(`O 105 foi reconhecido na aba “${match.sheetName}”, mas nenhuma linha com estoque físico foi encontrada.`)
  }

  const warnings = [
    'Fonte oficial do estoque: relatório 105 gerado com “Considerado: Físico”.',
    'Estoque ao custo = Qt.Est. físico × Real.',
    'Estoque a preço de venda = Qt.Est. físico × P. Venda.',
    'O 8013 fica como disponibilidade operacional/conferência e não valoriza o estoque físico.',
  ]
  if (branch && normalizeText(branch).replace(/\D/g, '') !== '11') warnings.push(`Atenção: o 105 informa Filial ${branch}; a referência esperada é Filial 11.`)
  if (stockDate) warnings.push(`Data da posição do 105: ${stockDate}.`)

  return {
    financeByCode,
    totalCost,
    totalSale,
    totalUnits,
    rows: used,
    priceRows,
    headers: match.headers.map(value => String(value ?? '')).filter(Boolean),
    warnings,
  }
}
