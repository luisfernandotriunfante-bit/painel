import { excelSerial, n, ratio, State } from './excelMath'
import { clearCell, setNumber, setText } from './excelXmlCore'

function currentCode(code: string, map: any) {
  if (map?.[code]) return String(map[code].currentCode || code)
  const match: any = Object.values(map ?? {}).find((item: any) => String(item.currentCode) === code)
  return String(match?.currentCode || code)
}

function rcaEntry(code: string, map: any) {
  if (map?.[code]) return map[code]
  const resolved = currentCode(code, map)
  return Object.values(map ?? {}).find((item: any) => String((item as any).currentCode) === resolved) as any
}

export function fillTeam(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const actual = new Map<string, any>()
  for (const item of state.salesSellerActuals ?? []) {
    const key = currentCode(String(item.code), state.rcaByOldCode)
    const row = actual.get(key) ?? { name: item.name ?? '', billed: 0, pending: 0, total: 0, billedPos: 0, pendingPos: 0, totalPos: 0 }
    const billed = item.billed == null ? 0 : n(item.billed)
    const pending = item.toInvoice == null ? 0 : n(item.toInvoice)
    const billedPos = item.billedPositives == null ? 0 : n(item.billedPositives)
    const pendingPos = item.toInvoicePositives == null ? 0 : n(item.toInvoicePositives)
    if (!row.name && item.name) row.name = item.name
    row.billed += billed
    row.pending += pending
    row.total += billed + pending
    row.billedPos += billedPos
    row.pendingPos += pendingPos
    row.totalPos += n(item.positives)
    actual.set(key, row)
  }

  const targets = [...(state.sellerTargets ?? [])]
    .sort((a: any, b: any) => Number(currentCode(String(a.code), state.rcaByOldCode)) - Number(currentCode(String(b.code), state.rcaByOldCode)))
    .slice(0, 24)

  const totals = { target: 0, billed: 0, pending: 0, total: 0, posTarget: 0, billedPos: 0, pendingPos: 0, totalPos: 0 }

  targets.forEach((target: any, index: number) => {
    const sheetRow = 4 + index
    const key = currentCode(String(target.code), state.rcaByOldCode)
    const entry = rcaEntry(String(target.code), state.rcaByOldCode)
    const a = actual.get(key) ?? { name: '', billed: 0, pending: 0, total: 0, billedPos: 0, pendingPos: 0, totalPos: 0 }
    const sellerName = String(entry?.name || target.name || a.name || '').trim()
    const coordinatorCode = String(entry?.coordinatorCode || '').trim()
    const coordinatorName = String(entry?.coordinatorName || '').trim()

    setText(document, `A${sheetRow}`, coordinatorCode)
    setText(document, `B${sheetRow}`, coordinatorName)
    setText(document, `C${sheetRow}`, key)
    setText(document, `D${sheetRow}`, sellerName)

    const goal = n(target.target)
    const posGoal = n(target.positiveTarget)
    const ideal = goal * worked / Math.max(1, targetDays)
    const idealPos = posGoal * worked / Math.max(1, targetDays)

    setNumber(document, `E${sheetRow}`, goal)
    setNumber(document, `F${sheetRow}`, a.billed)
    setNumber(document, `G${sheetRow}`, ratio(a.billed, goal))
    setNumber(document, `H${sheetRow}`, a.pending)
    setNumber(document, `I${sheetRow}`, a.total)
    setNumber(document, `J${sheetRow}`, ratio(a.total, goal))
    setNumber(document, `K${sheetRow}`, ideal)
    setNumber(document, `L${sheetRow}`, ideal - a.total)
    setNumber(document, `M${sheetRow}`, Math.max(0, goal - a.total))
    setNumber(document, `N${sheetRow}`, posGoal)
    setNumber(document, `O${sheetRow}`, a.billedPos)
    setNumber(document, `P${sheetRow}`, ratio(a.billedPos, posGoal))
    setNumber(document, `Q${sheetRow}`, a.pendingPos)
    setNumber(document, `R${sheetRow}`, a.totalPos)
    setNumber(document, `S${sheetRow}`, ratio(a.totalPos, posGoal))
    setNumber(document, `T${sheetRow}`, idealPos)
    setNumber(document, `U${sheetRow}`, idealPos - a.totalPos)
    setNumber(document, `V${sheetRow}`, Math.max(0, posGoal - a.totalPos))
    setNumber(document, `W${sheetRow}`, targetDays ? goal / targetDays : 0)

    totals.target += goal
    totals.billed += a.billed
    totals.pending += a.pending
    totals.total += a.total
    totals.posTarget += posGoal
    totals.billedPos += a.billedPos
    totals.pendingPos += a.pendingPos
    totals.totalPos += a.totalPos
  })

  for (let row = 4 + targets.length; row <= 27; row += 1) {
    for (const column of 'ABCDEFGHIJKLMNOPQRSTUVW') clearCell(document, `${column}${row}`)
  }

  const ideal = totals.target * worked / Math.max(1, targetDays)
  const idealPos = totals.posTarget * worked / Math.max(1, targetDays)
  const now = new Date()
  setText(document, 'A1', 'ATUALIZADO:')
  setNumber(document, 'B1', excelSerial(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()))
  setNumber(document, 'E1', totals.target)
  setNumber(document, 'F1', totals.billed)
  setNumber(document, 'G1', ratio(totals.billed, totals.target))
  setNumber(document, 'H1', totals.pending)
  setNumber(document, 'I1', totals.total)
  setNumber(document, 'J1', ratio(totals.total, totals.target))
  setNumber(document, 'K1', ideal)
  setNumber(document, 'L1', ideal - totals.total)
  setNumber(document, 'M1', Math.max(0, totals.target - totals.total))
  setNumber(document, 'N1', totals.posTarget)
  setNumber(document, 'O1', totals.billedPos)
  setNumber(document, 'P1', ratio(totals.billedPos, totals.posTarget))
  setNumber(document, 'Q1', totals.pendingPos)
  setNumber(document, 'R1', totals.totalPos)
  setNumber(document, 'S1', ratio(totals.totalPos, totals.posTarget))
  setNumber(document, 'T1', idealPos)
  setNumber(document, 'U1', idealPos - totals.totalPos)
  setNumber(document, 'V1', Math.max(0, totals.posTarget - totals.totalPos))
  setNumber(document, 'W1', targetDays ? totals.target / targetDays : 0)
}
