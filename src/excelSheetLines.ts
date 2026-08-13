import { clearCell, setNumber } from './excelXmlCore'
import { n, ratio, State, trend } from './excelMath'

export function fillLines(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const shares = [0.525, 0.095, 0.20, 0.095, 0.085]
  const target = n(state.sellOutTarget) || n(state.industryTarget)
  setNumber(document, 'I54', target)
  const hasDetail = (state.salesSellerActuals ?? []).some((seller: any) => seller.lineSales && Object.keys(seller.lineSales).length)
  if (!hasDetail) {
    for (let index = 0; index < 5; index += 1) {
      const column = String.fromCharCode(74 + index)
      setNumber(document, `${column}54`, target * shares[index])
      clearCell(document, `${column}55`)
      clearCell(document, `${column}56`)
      clearCell(document, `${column}57`)
    }
    return
  }
  const actual = [0, 0, 0, 0, 0]
  for (const seller of state.salesSellerActuals ?? []) {
    const values = Object.values(seller.lineSales ?? {}).slice(0, 5)
    values.forEach((value: unknown, index: number) => { actual[index] += n(value) })
  }
  actual.forEach((value, index) => {
    const column = String.fromCharCode(74 + index)
    const lineTarget = target * shares[index]
    setNumber(document, `${column}54`, lineTarget)
    setNumber(document, `${column}55`, value)
    setNumber(document, `${column}56`, ratio(value, lineTarget))
    setNumber(document, `${column}57`, trend(value, worked, targetDays))
  })
}
