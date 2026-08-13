import * as XLSX from 'xlsx'
import { cleanId, normalizeText } from './data'

export type Physical286Result = {
  physicalByCode: Record<string, number>
  availableByCode: Record<string, number>
  totalPhysical: number
  totalAvailable: number
  rows: number
  warnings: string[]
}

type Matrix = unknown[][]

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  let text = String(value).trim()
  if (!text) return 0
  text = text.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function parsePhysical286(file: File): Promise<Physical286Result> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })

  let rows: Matrix = []
  let headerRow = -1
  let physicalCol = -1
  let availableCol = -1

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
    for (let r = 0; r < Math.min(matrix.length, 100); r += 1) {
      const headers = (matrix[r] ?? []).map(normalizeText)
      const fisico = headers.findIndex(h => h === 'FISICO')
      const disponivel = headers.findIndex(h => h === 'DISP' || h === 'DISPONIVEL')
      if (fisico >= 0 && disponivel >= 0) {
        rows = matrix
        headerRow = r
        physicalCol = fisico
        availableCol = disponivel
        break
      }
    }
    if (headerRow >= 0) break
  }

  if (headerRow < 0) throw new Error('Não consegui localizar as colunas Físico e Disp. no relatório 286.')

  // No layout real do 286, a linha de dados inicia com Filial, Código e Descrição.
  // O cabeçalho visual é multinível; por isso o código do produto está uma coluna à direita
  // do rótulo “Código” mostrado na segunda linha do cabeçalho.
  const codeCol = 1
  const physicalByCode: Record<string, number> = {}
  const availableByCode: Record<string, number> = {}
  let totalPhysical = 0
  let totalAvailable = 0
  let used = 0

  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const code = cleanId(row[codeCol])
    if (!code) continue
    const physical = numberValue(row[physicalCol])
    const available = numberValue(row[availableCol])
    physicalByCode[code] = physical
    availableByCode[code] = available
    totalPhysical += physical
    totalAvailable += available
    used += 1
  }

  if (!used) throw new Error('O 286 foi reconhecido, mas nenhum produto com código foi encontrado.')

  return {
    physicalByCode,
    availableByCode,
    totalPhysical,
    totalAvailable,
    rows: used,
    warnings: [
      'O 286 passa a ser a fonte da quantidade física do estoque (coluna Físico).',
      'A coluna Disp. do 286 e o 8013 representam disponibilidade e não substituem o estoque físico para valorização.',
    ],
  }
}
