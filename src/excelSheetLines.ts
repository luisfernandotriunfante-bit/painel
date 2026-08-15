import { clearCell, setNumber } from './excelXmlCore'
import type { PanelMetrics } from './panelMetrics'

export function fillLines(document: XMLDocument, metrics: PanelMetrics) {
  if (Math.abs(metrics.lineShareTotal - 1) > 0.0001) {
    throw new Error(`As participações das 5 linhas precisam somar 100% para gerar o Excel. Hoje somam ${(metrics.lineShareTotal * 100).toFixed(2)}%.`)
  }
  if (!metrics.hasBilledLineDetail && metrics.hasLegacyLineDetail) {
    throw new Error('Para preencher as 5 linhas exatamente como a planilha FORMULA, reprocesse o relatório 8022 uma vez nesta versão do painel e gere o Excel novamente.')
  }

  setNumber(document, 'I54', metrics.summary.target)
  const totalActual = metrics.lines.reduce((sum, line) => sum + line.billed, 0)
  if (metrics.hasBilledLineDetail) setNumber(document, 'I52', totalActual)
  else clearCell(document, 'I52')
  setNumber(document, 'I53', 0)
  setNumber(document, 'J52', 0)

  metrics.lines.forEach((line, index) => {
    const column = String.fromCharCode(74 + index)
    setNumber(document, `${column}39`, line.target)
    setNumber(document, `${column}54`, line.target)

    if (!metrics.hasBilledLineDetail) {
      for (const row of [40, 41, 42, 55, 56, 57]) clearCell(document, `${column}${row}`)
    } else {
      setNumber(document, `${column}40`, line.billed)
      setNumber(document, `${column}41`, line.achievement)
      setNumber(document, `${column}42`, line.billedTrend)
      setNumber(document, `${column}55`, line.billed)
      setNumber(document, `${column}56`, line.achievement)
      setNumber(document, `${column}57`, line.billedTrend)
    }

    if (line.budgetUsed == null) {
      clearCell(document, `${column}58`)
      clearCell(document, `${column}59`)
    } else {
      setNumber(document, `${column}58`, line.budgetUsed)
      if (line.budgetPctOfBilled == null) clearCell(document, `${column}59`)
      else setNumber(document, `${column}59`, line.budgetPctOfBilled)
    }
  })
}
