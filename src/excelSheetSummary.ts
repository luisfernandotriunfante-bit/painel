import { setNumber, setText } from './excelXmlCore'
import { monthName } from './excelMath'
import type { PanelMetrics } from './panelMetrics'

export function fillSummary(document: XMLDocument, metrics: PanelMetrics) {
  const summary = metrics.summary
  setNumber(document, 'M3', summary.dailyTarget)
  setNumber(document, 'N3', summary.dailyTarget ? 1 : 0)
  setNumber(document, 'M4', summary.currentDaily)
  setNumber(document, 'N4', summary.currentDailyAchievement)
  setNumber(document, 'M5', summary.neededDaily)
  setNumber(document, 'N5', summary.neededDailyAchievement)
  setNumber(document, 'M8', summary.target)
  setNumber(document, 'M9', summary.billed)
  setNumber(document, 'N9', summary.billedAchievement)
  setNumber(document, 'M10', summary.billedTrend)
  setNumber(document, 'N10', summary.billedTrendAchievement)
  setNumber(document, 'M11', summary.sellOut)
  setNumber(document, 'N11', summary.sellOutAchievement)
  setNumber(document, 'M12', summary.sellOutTrend)
  setNumber(document, 'N12', summary.sellOutTrendAchievement)
  setText(document, 'I15', `Sell Out ${monthName(metrics.period.year, metrics.period.month)} ${metrics.period.year - 1}`)
  setNumber(document, 'M15', summary.previous)
  setNumber(document, 'N15', summary.variationTrendVsPrevious ?? 0)
  setNumber(document, 'M16', summary.average3)
  setNumber(document, 'N16', summary.variationTrendVsAverage3 ?? 0)
}
