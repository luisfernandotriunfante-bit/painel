import { setNumber, setText } from './excelXmlCore'
import { avg3, monthName, n, ratio, State, sumMonth, trend } from './excelMath'

export function fillSummary(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const target = n(state.sellOutTarget) || n(state.industryTarget)
  const billedTrend = trend(n(state.billed), worked, targetDays)
  const sellOutTrend = trend(n(state.sellOut), worked, targetDays)
  const previous = sumMonth(state, state.periodYear - 1, state.periodMonth)
  const average = avg3(state)
  const dailyTarget = ratio(target, targetDays)
  const currentDaily = ratio(n(state.sellOut), worked)
  const remainingDays = targetDays - worked
  const neededDaily = remainingDays > 0 ? (target - n(state.sellOut)) / remainingDays : 0
  setNumber(document, 'M3', dailyTarget)
  setNumber(document, 'N3', 1)
  setNumber(document, 'M4', currentDaily)
  setNumber(document, 'N4', ratio(currentDaily, dailyTarget))
  setNumber(document, 'M5', neededDaily)
  setNumber(document, 'N5', ratio(neededDaily, dailyTarget))
  setNumber(document, 'M8', target)
  setNumber(document, 'M9', n(state.billed))
  setNumber(document, 'N9', ratio(n(state.billed), target))
  setNumber(document, 'M10', billedTrend)
  setNumber(document, 'N10', ratio(billedTrend, target))
  setNumber(document, 'M11', n(state.sellOut))
  setNumber(document, 'N11', ratio(n(state.sellOut), target))
  setNumber(document, 'M12', sellOutTrend)
  setNumber(document, 'N12', ratio(sellOutTrend, target))
  setText(document, 'I15', `Sell Out ${monthName(state.periodYear, state.periodMonth)} ${state.periodYear - 1}`)
  setNumber(document, 'M15', previous)
  setNumber(document, 'N15', previous ? billedTrend / previous - 1 : 0)
  setNumber(document, 'M16', average)
  setNumber(document, 'N16', average ? billedTrend / average - 1 : 0)
}
