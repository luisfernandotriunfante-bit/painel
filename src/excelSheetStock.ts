import { clearCell, setNumber } from './excelXmlCore'
import type { PanelMetrics } from './panelMetrics'

export function fillStock(document: XMLDocument, metrics: PanelMetrics) {
  const stock = metrics.stock
  setNumber(document, 'M20', stock.coverageTargetDays)
  setNumber(document, 'M27', stock.coverageTargetDays)

  if (metrics.availability.position) {
    setNumber(document, 'L19', stock.positionSale)
    setNumber(document, 'L20', stock.saleCoverage)
    setNumber(document, 'N20', stock.saleCoverageGap)
    setNumber(document, 'L24', stock.markup)
    setNumber(document, 'L26', stock.positionCost)
    setNumber(document, 'L27', stock.costCoverage)
    setNumber(document, 'N27', stock.costCoverageGap)
  } else {
    for (const address of ['L19', 'L20', 'N20', 'L24', 'L26', 'L27', 'N27']) clearCell(document, address)
  }

  if (metrics.availability.transit) {
    setNumber(document, 'L21', stock.transitSale)
    setNumber(document, 'L28', stock.transitCost)
  } else {
    clearCell(document, 'L21')
    clearCell(document, 'L28')
  }

  if (metrics.availability.position && metrics.availability.transit) {
    setNumber(document, 'L22', stock.totalSale)
    setNumber(document, 'L23', stock.totalSaleCoverage)
    setNumber(document, 'L29', stock.totalCost)
    setNumber(document, 'L30', stock.totalCostCoverage)
  } else {
    for (const address of ['L22', 'L23', 'L29', 'L30']) clearCell(document, address)
  }

  const positives = metrics.positives
  if (metrics.availability.targets) setNumber(document, 'L33', positives.target)
  else clearCell(document, 'L33')
  setNumber(document, 'L34', positives.current)
  if (metrics.availability.targets) setNumber(document, 'M34', positives.achievement)
  else clearCell(document, 'M34')
  setNumber(document, 'L35', positives.trend)
  if (metrics.availability.targets) setNumber(document, 'M35', positives.trendAchievement)
  else clearCell(document, 'M35')
  if (metrics.availability.history) {
    setNumber(document, 'L36', positives.average3)
    if (metrics.availability.targets) setNumber(document, 'M36', positives.average3Achievement)
    else clearCell(document, 'M36')
  } else {
    clearCell(document, 'L36')
    clearCell(document, 'M36')
  }
}
