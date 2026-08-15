import { setNumber } from './excelXmlCore'
import type { PanelMetrics } from './panelMetrics'

export function fillStock(document: XMLDocument, metrics: PanelMetrics) {
  const stock = metrics.stock
  setNumber(document, 'L19', stock.positionSale)
  setNumber(document, 'L20', stock.saleCoverage)
  setNumber(document, 'M20', stock.coverageTargetDays)
  setNumber(document, 'N20', stock.saleCoverageGap)
  setNumber(document, 'L21', stock.transitSale)
  setNumber(document, 'L22', stock.totalSale)
  setNumber(document, 'L23', stock.totalSaleCoverage)
  setNumber(document, 'L24', stock.markup)

  setNumber(document, 'L26', stock.positionCost)
  setNumber(document, 'L27', stock.costCoverage)
  setNumber(document, 'M27', stock.coverageTargetDays)
  setNumber(document, 'N27', stock.costCoverageGap)
  setNumber(document, 'L28', stock.transitCost)
  setNumber(document, 'L29', stock.totalCost)
  setNumber(document, 'L30', stock.totalCostCoverage)

  const positives = metrics.positives
  setNumber(document, 'L33', positives.target)
  setNumber(document, 'L34', positives.current)
  setNumber(document, 'M34', positives.achievement)
  setNumber(document, 'L35', positives.trend)
  setNumber(document, 'M35', positives.trendAchievement)
  setNumber(document, 'L36', positives.average3)
  setNumber(document, 'M36', positives.average3Achievement)
}
