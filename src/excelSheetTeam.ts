import { excelSerial, monthName } from './excelMath'
import { clearCell, clearParts, NS, setNumber, setText } from './excelXmlCore'
import type { PanelMetrics } from './panelMetrics'

function rowNumber(row: Element) {
  return Number(row.getAttribute('r')) || 0
}

function ensureTeamRows(document: XMLDocument, requiredEndRow: number) {
  const sheetData = document.getElementsByTagNameNS(NS, 'sheetData')[0]
  if (!sheetData) throw new Error('A aba EQUIPES do modelo não possui a estrutura de linhas esperada.')

  const rows = Array.from(sheetData.getElementsByTagNameNS(NS, 'row'))
  const currentEndRow = rows.reduce((max, row) => Math.max(max, rowNumber(row)), 0)
  if (!currentEndRow) throw new Error('A aba EQUIPES do modelo está vazia.')

  if (requiredEndRow > currentEndRow) {
    const templateRow = rows.find(row => rowNumber(row) === currentEndRow) ?? rows[rows.length - 1]
    for (let nextRow = currentEndRow + 1; nextRow <= requiredEndRow; nextRow += 1) {
      const clone = templateRow.cloneNode(true) as Element
      clone.setAttribute('r', String(nextRow))
      for (const cell of Array.from(clone.getElementsByTagNameNS(NS, 'c'))) {
        const reference = cell.getAttribute('r') ?? 'A1'
        const column = reference.match(/^[A-Z]+/)?.[0] ?? 'A'
        cell.setAttribute('r', `${column}${nextRow}`)
        clearParts(cell)
        cell.removeAttribute('t')
      }
      sheetData.appendChild(clone)
    }
  }

  const endRow = Math.max(currentEndRow, requiredEndRow)
  const dimension = document.getElementsByTagNameNS(NS, 'dimension')[0]
  if (dimension) dimension.setAttribute('ref', `A1:W${endRow}`)
  const autoFilter = document.getElementsByTagNameNS(NS, 'autoFilter')[0]
  if (autoFilter) autoFilter.setAttribute('ref', `A3:W${endRow}`)
  return endRow
}

export function updateTeamFilterDatabase(workbook: XMLDocument, endRow: number) {
  const names = Array.from(workbook.getElementsByTagNameNS(NS, 'definedName'))
  const filter = names.find(item => item.getAttribute('name') === '_xlnm._FilterDatabase' && String(item.textContent ?? '').includes('EQUIPES!'))
  if (filter) filter.textContent = `EQUIPES!$A$3:$W$${endRow}`
}

export function fillTeam(document: XMLDocument, metrics: PanelMetrics) {
  const capacityEndRow = ensureTeamRows(document, Math.max(27, 3 + metrics.team.length))
  const month = monthName(metrics.period.year, metrics.period.month)
  setText(document, 'E2', `SELL-OUT MÊS ${month}`)
  setText(document, 'N2', `POSITIVAÇÃO ${month}`)

  metrics.team.forEach((row, index) => {
    const sheetRow = 4 + index
    setText(document, `A${sheetRow}`, row.coordinatorCode)
    setText(document, `B${sheetRow}`, row.coordinatorName)
    setText(document, `C${sheetRow}`, row.code)
    setText(document, `D${sheetRow}`, row.name)
    setNumber(document, `E${sheetRow}`, row.target)
    setNumber(document, `F${sheetRow}`, row.billed)
    setNumber(document, `G${sheetRow}`, row.billedAchievement)
    setNumber(document, `H${sheetRow}`, row.toInvoice)
    setNumber(document, `I${sheetRow}`, row.total)
    setNumber(document, `J${sheetRow}`, row.totalAchievement)
    if (row.ideal == null) clearCell(document, `K${sheetRow}`)
    else setNumber(document, `K${sheetRow}`, row.ideal)
    if (row.idealGap == null) clearCell(document, `L${sheetRow}`)
    else setNumber(document, `L${sheetRow}`, row.idealGap)
    setNumber(document, `M${sheetRow}`, row.targetGap)
    setNumber(document, `N${sheetRow}`, row.positiveTarget)
    setNumber(document, `O${sheetRow}`, row.billedPositives)
    setNumber(document, `P${sheetRow}`, row.billedPositiveAchievement)
    setNumber(document, `Q${sheetRow}`, row.toInvoicePositives)
    setNumber(document, `R${sheetRow}`, row.totalPositives)
    setNumber(document, `S${sheetRow}`, row.totalPositiveAchievement)
    if (row.idealPositives == null) clearCell(document, `T${sheetRow}`)
    else setNumber(document, `T${sheetRow}`, row.idealPositives)
    if (row.idealPositiveGap == null) clearCell(document, `U${sheetRow}`)
    else setNumber(document, `U${sheetRow}`, row.idealPositiveGap)
    setNumber(document, `V${sheetRow}`, row.positiveGap)
    if (row.positiveTargetPerDay == null) clearCell(document, `W${sheetRow}`)
    else setNumber(document, `W${sheetRow}`, row.positiveTargetPerDay)
  })

  for (let row = 4 + metrics.team.length; row <= capacityEndRow; row += 1) {
    for (const column of 'ABCDEFGHIJKLMNOPQRSTUVW') clearCell(document, `${column}${row}`)
  }

  const generated = new Date(metrics.period.updatedAt)
  const totals = metrics.teamTotals
  setText(document, 'A1', 'ATUALIZADO:')
  setNumber(document, 'B1', excelSerial(generated.getFullYear(), generated.getMonth() + 1, generated.getDate(), generated.getHours(), generated.getMinutes(), generated.getSeconds()))
  setNumber(document, 'E1', totals.target)
  setNumber(document, 'F1', totals.billed)
  setNumber(document, 'G1', totals.billedAchievement)
  setNumber(document, 'H1', totals.toInvoice)
  setNumber(document, 'I1', totals.total)
  setNumber(document, 'J1', totals.totalAchievement)
  setNumber(document, 'K1', totals.ideal)
  setNumber(document, 'L1', totals.idealGap)
  setNumber(document, 'M1', totals.targetGap)
  setNumber(document, 'N1', totals.positiveTarget)
  setNumber(document, 'O1', totals.billedPositives)
  setNumber(document, 'P1', totals.billedPositiveAchievement)
  setNumber(document, 'Q1', totals.toInvoicePositives)
  setNumber(document, 'R1', totals.totalPositives)
  setNumber(document, 'S1', totals.totalPositiveAchievement)
  setNumber(document, 'T1', totals.idealPositives)
  setNumber(document, 'U1', totals.idealPositiveGap)
  setNumber(document, 'V1', totals.positiveGap)
  if (metrics.timing.remainingDays <= 0) clearCell(document, 'W1')
  else setNumber(document, 'W1', totals.positiveTargetPerDay)

  return { endRow: capacityEndRow }
}
