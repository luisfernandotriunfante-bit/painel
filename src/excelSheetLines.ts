import { clearCell, setNumber } from './excelXmlCore'
import { n, ratio, State, trend } from './excelMath'

const LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const
const SHARES = [0.525, 0.095, 0.20, 0.095, 0.085]

export function fillLines(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const target = n(state.sellOutTarget) || n(state.industryTarget)
  const actual = [0, 0, 0, 0, 0]
  let hasBilledDetail = false
  let hasLegacyCombinedDetail = false

  for (const seller of state.salesSellerActuals ?? []) {
    if (seller.lineSales && Object.keys(seller.lineSales).length) hasLegacyCombinedDetail = true
    const source = seller.lineBilledSales
    if (!source || !Object.keys(source).length) continue
    hasBilledDetail = true
    LINE_NAMES.forEach((name, index) => { actual[index] += n(source[name]) })
  }

  // Versões anteriores do painel gravavam apenas lineSales, que mistura
  // Faturado + A Faturar. A planilha FORMULA apura LINHAS exclusivamente pelo
  // faturado do 12.310; portanto não estimamos nem rateamos essa diferença.
  if (!hasBilledDetail && hasLegacyCombinedDetail) {
    throw new Error('Para preencher as 5 linhas exatamente como a planilha FORMULA, reprocesse o relatório 8022 uma vez nesta versão do painel e gere o Excel novamente.')
  }

  const targetValues = SHARES.map(share => target * share)
  setNumber(document, 'I54', target)

  targetValues.forEach((lineTarget, index) => {
    const column = String.fromCharCode(74 + index)
    setNumber(document, `${column}39`, lineTarget)
    setNumber(document, `${column}54`, lineTarget)
  })

  if (!hasBilledDetail) {
    for (let index = 0; index < 5; index += 1) {
      const column = String.fromCharCode(74 + index)
      for (const row of [40, 41, 42, 55, 56, 57]) clearCell(document, `${column}${row}`)
      setNumber(document, `${column}58`, 0)
      setNumber(document, `${column}59`, 0)
    }
    clearCell(document, 'I52')
    setNumber(document, 'I53', 0)
    setNumber(document, 'J52', 0)
    return
  }

  const totalActual = actual.reduce((sum, value) => sum + value, 0)
  setNumber(document, 'I52', totalActual)
  setNumber(document, 'I53', 0)
  setNumber(document, 'J52', 0)

  actual.forEach((value, index) => {
    const column = String.fromCharCode(74 + index)
    const lineTarget = targetValues[index]
    const coverage = ratio(value, lineTarget)
    const tendency = trend(value, worked, targetDays)

    setNumber(document, `${column}40`, value)
    setNumber(document, `${column}41`, coverage)
    setNumber(document, `${column}42`, tendency)

    setNumber(document, `${column}55`, value)
    setNumber(document, `${column}56`, coverage)
    setNumber(document, `${column}57`, tendency)

    // A planilha de referência reserva estas linhas para verba utilizada.
    // O painel atual não possui essa origem, portanto elas são materializadas
    // em zero em vez de manter valores antigos do modelo.
    setNumber(document, `${column}58`, 0)
    setNumber(document, `${column}59`, 0)
  })
}
