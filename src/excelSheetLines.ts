import { clearCell, setNumber } from './excelXmlCore'
import { n, ratio, State, trend } from './excelMath'

const LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const
const LINE_SHARES = [0.525, 0.095, 0.20, 0.095, 0.085] as const

export function fillLines(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const target = n(state.sellOutTarget) || n(state.industryTarget)
  setNumber(document, 'I54', target)

  const hasDetail = (state.salesSellerActuals ?? []).some((seller: any) =>
    LINE_NAMES.some(line => seller.lineSales?.[line] != null),
  )

  if (!hasDetail) {
    LINE_NAMES.forEach((_, index) => {
      const column = String.fromCharCode(74 + index)
      setNumber(document, `${column}54`, target * LINE_SHARES[index])
      clearCell(document, `${column}55`)
      clearCell(document, `${column}56`)
      clearCell(document, `${column}57`)
    })
    return
  }

  const actual = LINE_NAMES.map(line =>
    (state.salesSellerActuals ?? []).reduce(
      (sum: number, seller: any) => sum + n(seller.lineSales?.[line]),
      0,
    ),
  )

  actual.forEach((value, index) => {
    const column = String.fromCharCode(74 + index)
    const lineTarget = target * LINE_SHARES[index]
    setNumber(document, `${column}54`, lineTarget)
    setNumber(document, `${column}55`, value)
    setNumber(document, `${column}56`, ratio(value, lineTarget))
    setNumber(document, `${column}57`, trend(value, worked, targetDays))
  })
}
