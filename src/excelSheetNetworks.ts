import { clearCell, setNumber, setText } from './excelXmlCore'
import type { PanelMetrics } from './panelMetrics'

export function fillNetworks(document: XMLDocument, metrics: PanelMetrics) {
  const starts = [7, 14, 21, 28, 35]
  setNumber(document, 'Q3', metrics.networkTotals.target)
  setNumber(document, 'Q4', metrics.networkTotals.billed)
  setNumber(document, 'R4', metrics.networkTotals.billedAchievement)

  starts.forEach((row, index) => {
    const item = metrics.networks[index]
    if (!item) {
      for (let current = row - 1; current <= row + 5; current += 1) {
        for (const column of ['P', 'Q', 'R']) clearCell(document, `${column}${current}`)
      }
      return
    }

    setText(document, `Q${row - 1}`, `REDE ${item.name}`)
    if (metrics.availability.history) setNumber(document, `R${row - 1}`, item.previous)
    else clearCell(document, `R${row - 1}`)
    setText(document, `P${row}`, `REDE ${item.name}`)
    clearCell(document, `Q${row}`)
    clearCell(document, `R${row}`)
    setNumber(document, `Q${row + 1}`, item.target)
    setNumber(document, `Q${row + 2}`, item.billed)
    setNumber(document, `R${row + 2}`, item.billedAchievement)
    setNumber(document, `Q${row + 3}`, item.billedTrend)
    setNumber(document, `R${row + 3}`, item.billedTrendAchievement)
    setNumber(document, `Q${row + 4}`, item.sellOut)
    setNumber(document, `R${row + 4}`, item.sellOutAchievement)
    setNumber(document, `Q${row + 5}`, item.sellOutTrend)
    setNumber(document, `R${row + 5}`, item.sellOutTrendAchievement)
  })
}
