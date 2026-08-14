import { monthKey, n, ratio, State, trend } from './excelMath'
import { clearCell, setNumber, setText } from './excelXmlCore'

export function fillNetworks(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const names = (state.strategicNetworks ?? []).slice(0, 5)
  const buckets = new Map(names.map((name: string) => [name, { billed: 0, total: 0, previous: 0 }]))
  for (const customer of state.salesCustomers ?? []) {
    const id = customer['c' + 'npj']
    const bucket: any = buckets.get(state.networkByCnpj?.[id])
    if (!bucket) continue
    bucket.total += n(customer.value)
    if (customer.billed != null) bucket.billed += n(customer.billed)
  }
  const oldMonth = state.historyByMonth?.[monthKey(state.periodYear - 1, state.periodMonth)] ?? {}
  for (const [id, value] of Object.entries(oldMonth)) {
    const bucket: any = buckets.get(state.networkByCnpj?.[id])
    if (bucket) bucket.previous += n(value)
  }
  const rows = names.map((name: string) => ({ name, target: n(state.networkTargets?.[name]?.target), ...(buckets.get(name) as any) }))
  const starts = [7, 14, 21, 28, 35]
  const pool = n(state.networkPoolTarget) || rows.reduce((sum: number, item: any) => sum + item.target, 0)
  const billed = rows.reduce((sum: number, item: any) => sum + item.billed, 0)
  setNumber(document, 'Q3', pool)
  setNumber(document, 'Q4', billed)
  setNumber(document, 'R4', ratio(billed, pool))
  starts.forEach((row, index) => {
    const item: any = rows[index]
    if (!item) return
    setText(document, `Q${row - 1}`, `REDE ${item.name}`)
    setNumber(document, `R${row - 1}`, item.previous)
    setText(document, `P${row}`, `REDE ${item.name}`)
    clearCell(document, `Q${row}`)
    clearCell(document, `R${row}`)
    setNumber(document, `Q${row + 1}`, item.target)
    const billedTrend = trend(item.billed, worked, targetDays)
    const totalTrend = trend(item.total, worked, targetDays)
    setNumber(document, `Q${row + 2}`, item.billed)
    setNumber(document, `R${row + 2}`, ratio(item.billed, item.target))
    setNumber(document, `Q${row + 3}`, billedTrend)
    setNumber(document, `R${row + 3}`, ratio(billedTrend, item.target))
    setNumber(document, `Q${row + 4}`, item.total)
    setNumber(document, `R${row + 4}`, ratio(item.total, item.target))
    setNumber(document, `Q${row + 5}`, totalTrend)
    setNumber(document, `R${row + 5}`, ratio(totalTrend, item.target))
  })
}
