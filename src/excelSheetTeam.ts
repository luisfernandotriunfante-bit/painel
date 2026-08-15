import { excelSerial, monthName, n, ratio, State } from './excelMath'
import { clearCell, setNumber, setText } from './excelXmlCore'

type RcaEntry = {
  currentCode?: string
  name?: string
  coordinatorCode?: string
  coordinatorName?: string
}

function cleanCode(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? (digits.replace(/^0+/, '') || '0') : String(value ?? '').trim()
}

function currentCode(code: string, map: Record<string, RcaEntry>) {
  const clean = cleanCode(code)
  if (map?.[clean]?.currentCode) return cleanCode(map[clean].currentCode)
  const match = Object.values(map ?? {}).find(item => cleanCode(item.currentCode) === clean)
  return match ? cleanCode(match.currentCode) : clean
}

function currentEntry(code: string, map: Record<string, RcaEntry>) {
  const clean = currentCode(code, map)
  const direct = map?.[clean]
  if (direct && cleanCode(direct.currentCode) === clean) return direct
  return Object.values(map ?? {}).find(item => cleanCode(item.currentCode) === clean) ?? null
}

function codeSort(a: string, b: string) {
  const na = Number(a), nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.localeCompare(b, 'pt-BR', { numeric: true })
}

export function fillTeam(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const map: Record<string, RcaEntry> = state.rcaByOldCode ?? {}

  const actual = new Map<string, any>()
  for (const item of state.salesSellerActuals ?? []) {
    const key = currentCode(String(item.code), map)
    const row = actual.get(key) ?? { name: '', billed: 0, pending: 0, total: 0, billedPos: 0, pendingPos: 0, totalPos: 0 }
    const billed = item.billed == null ? 0 : n(item.billed)
    const pending = item.toInvoice == null ? Math.max(0, n(item.sellOut) - billed) : n(item.toInvoice)
    const billedPos = item.billedPositives == null ? 0 : n(item.billedPositives)
    const pendingPos = item.toInvoicePositives == null ? Math.max(0, n(item.positives) - billedPos) : n(item.toInvoicePositives)
    row.name = String(item.name ?? row.name ?? '')
    row.billed += billed
    row.pending += pending
    row.total += billed + pending
    row.billedPos += billedPos
    row.pendingPos += pendingPos
    row.totalPos += n(item.positives)
    actual.set(key, row)
  }

  const targets = new Map<string, any>()
  for (const item of state.sellerTargets ?? []) {
    const key = currentCode(String(item.code), map)
    const row = targets.get(key) ?? { name: '', target: 0, positiveTarget: 0 }
    row.name = String(item.name ?? row.name ?? '')
    row.target += n(item.target)
    row.positiveTarget += n(item.positiveTarget)
    targets.set(key, row)
  }

  const codes = [...new Set([...targets.keys(), ...actual.keys()])].sort(codeSort)
  if (codes.length > 24) {
    throw new Error(`O modelo oficial possui 24 linhas de equipe, mas o painel tem ${codes.length} RCAs com meta ou movimento. Ajuste o modelo antes de exportar para não perder vendedor.`)
  }

  const month = monthName(state.periodYear, state.periodMonth)
  setText(document, 'E2', `SELL-OUT MÊS ${month}`)
  setText(document, 'N2', `POSITIVAÇÃO ${month}`)

  const totals = {
    target: 0, billed: 0, pending: 0, total: 0,
    ideal: 0, idealGap: 0, targetGap: 0,
    posTarget: 0, billedPos: 0, pendingPos: 0, totalPos: 0,
    idealPos: 0, idealPosGap: 0, posGap: 0, dailyPos: 0,
  }
  const remainingDays = targetDays - worked

  codes.forEach((code, index) => {
    const sheetRow = 4 + index
    const target = targets.get(code) ?? { name: '', target: 0, positiveTarget: 0 }
    const a = actual.get(code) ?? { name: '', billed: 0, pending: 0, total: 0, billedPos: 0, pendingPos: 0, totalPos: 0 }
    const entry = currentEntry(code, map)
    const goal = n(target.target)
    const posGoal = n(target.positiveTarget)
    const idealRaw = targetDays > 0 ? goal / targetDays * worked : 0
    const idealPosRaw = targetDays > 0 ? posGoal / targetDays * worked : 0
    const showIdeal = idealRaw > a.total
    const showIdealPos = idealPosRaw > a.totalPos
    const targetGap = Math.max(0, goal - a.total)
    const posGap = posGoal - a.totalPos
    const dailyPos = remainingDays > 0 ? Math.max(0, posGap / remainingDays) : null
    const sellerName = String(entry?.name || target.name || a.name || `Setor ${code}`)

    setText(document, `A${sheetRow}`, String(entry?.coordinatorCode ?? ''))
    setText(document, `B${sheetRow}`, String(entry?.coordinatorName ?? ''))
    setText(document, `C${sheetRow}`, code)
    setText(document, `D${sheetRow}`, sellerName)

    setNumber(document, `E${sheetRow}`, goal)
    setNumber(document, `F${sheetRow}`, a.billed)
    setNumber(document, `G${sheetRow}`, ratio(a.billed, goal))
    setNumber(document, `H${sheetRow}`, a.pending)
    setNumber(document, `I${sheetRow}`, a.total)
    setNumber(document, `J${sheetRow}`, ratio(a.total, goal))
    if (showIdeal) {
      setNumber(document, `K${sheetRow}`, idealRaw)
      setNumber(document, `L${sheetRow}`, idealRaw - a.total)
    } else {
      clearCell(document, `K${sheetRow}`)
      clearCell(document, `L${sheetRow}`)
    }
    setNumber(document, `M${sheetRow}`, targetGap)

    setNumber(document, `N${sheetRow}`, posGoal)
    setNumber(document, `O${sheetRow}`, a.billedPos)
    setNumber(document, `P${sheetRow}`, ratio(a.billedPos, posGoal))
    setNumber(document, `Q${sheetRow}`, a.pendingPos)
    setNumber(document, `R${sheetRow}`, a.totalPos)
    setNumber(document, `S${sheetRow}`, ratio(a.totalPos, posGoal))
    if (showIdealPos) {
      setNumber(document, `T${sheetRow}`, idealPosRaw)
      setNumber(document, `U${sheetRow}`, idealPosRaw - a.totalPos)
    } else {
      clearCell(document, `T${sheetRow}`)
      clearCell(document, `U${sheetRow}`)
    }
    setNumber(document, `V${sheetRow}`, posGap)
    if (dailyPos == null) clearCell(document, `W${sheetRow}`)
    else setNumber(document, `W${sheetRow}`, dailyPos)

    totals.target += goal
    totals.billed += a.billed
    totals.pending += a.pending
    totals.total += a.total
    totals.ideal += showIdeal ? idealRaw : 0
    totals.idealGap += showIdeal ? idealRaw - a.total : 0
    totals.targetGap += targetGap
    totals.posTarget += posGoal
    totals.billedPos += a.billedPos
    totals.pendingPos += a.pendingPos
    totals.totalPos += a.totalPos
    totals.idealPos += showIdealPos ? idealPosRaw : 0
    totals.idealPosGap += showIdealPos ? idealPosRaw - a.totalPos : 0
    totals.posGap += posGap
    totals.dailyPos += dailyPos ?? 0
  })

  for (let row = 4 + codes.length; row <= 27; row += 1) {
    for (const column of 'ABCDEFGHIJKLMNOPQRSTUVW') clearCell(document, `${column}${row}`)
  }

  const now = new Date()
  setText(document, 'A1', 'ATUALIZADO:')
  setNumber(document, 'B1', excelSerial(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()))
  setNumber(document, 'E1', totals.target)
  setNumber(document, 'F1', totals.billed)
  setNumber(document, 'G1', ratio(totals.billed, totals.target))
  setNumber(document, 'H1', totals.pending)
  setNumber(document, 'I1', totals.total)
  setNumber(document, 'J1', ratio(totals.total, totals.target))
  setNumber(document, 'K1', totals.ideal)
  setNumber(document, 'L1', totals.idealGap)
  setNumber(document, 'M1', totals.targetGap)
  setNumber(document, 'N1', totals.posTarget)
  setNumber(document, 'O1', totals.billedPos)
  setNumber(document, 'P1', ratio(totals.billedPos, totals.posTarget))
  setNumber(document, 'Q1', totals.pendingPos)
  setNumber(document, 'R1', totals.totalPos)
  setNumber(document, 'S1', ratio(totals.totalPos, totals.posTarget))
  setNumber(document, 'T1', totals.idealPos)
  setNumber(document, 'U1', totals.idealPosGap)
  setNumber(document, 'V1', totals.posGap)
  if (remainingDays <= 0) clearCell(document, 'W1')
  else setNumber(document, 'W1', totals.dailyPos)
}
