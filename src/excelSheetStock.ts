import { clearCell, setNumber } from './excelXmlCore'
import { avg3, avg3Pos, n, ratio, State, trend } from './excelMath'

export function fillStock(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const average = avg3(state)
  const dailyBase = average > 0 ? average / 30 : 0
  const transitSale = n(state.stockTransit)
  const costRatio = state.positionSale > 0 ? state.positionCost / state.positionSale : 1
  const transitCost = transitSale * costRatio
  const saleCoverage = dailyBase ? n(state.positionSale) / dailyBase : 0
  const costCoverage = dailyBase ? n(state.positionCost) / dailyBase : 0
  setNumber(document, 'L19', n(state.positionSale))
  setNumber(document, 'L20', saleCoverage)
  setNumber(document, 'M20', 60)
  setNumber(document, 'N20', 60 - saleCoverage)
  setNumber(document, 'L21', transitSale)
  setNumber(document, 'L22', n(state.positionSale) + transitSale)
  setNumber(document, 'L23', dailyBase ? (n(state.positionSale) + transitSale) / dailyBase : 0)
  setNumber(document, 'L26', n(state.positionCost))
  setNumber(document, 'L27', costCoverage)
  setNumber(document, 'M27', 60)
  setNumber(document, 'N27', 60 - costCoverage)
  setNumber(document, 'L28', transitCost)
  setNumber(document, 'L29', n(state.positionCost) + transitCost)
  setNumber(document, 'L30', dailyBase ? (n(state.positionCost) + transitCost) / dailyBase : 0)

  const positiveTarget = n(state.sellOutPositiveTarget)
  const positives = n(state.potentialPositives)
  const positiveTrend = trend(positives, worked, targetDays)
  const positiveAverage = avg3Pos(state)

  if (positiveTarget > 0) {
    setNumber(document, 'L33', positiveTarget)
    setNumber(document, 'M34', ratio(positives, positiveTarget))
    setNumber(document, 'M35', ratio(positiveTrend, positiveTarget))
    setNumber(document, 'M36', ratio(positiveAverage, positiveTarget))
  } else {
    clearCell(document, 'L33')
    clearCell(document, 'M34')
    clearCell(document, 'M35')
    clearCell(document, 'M36')
  }

  setNumber(document, 'L34', positives)
  setNumber(document, 'L35', positiveTrend)
  setNumber(document, 'L36', positiveAverage)
}
