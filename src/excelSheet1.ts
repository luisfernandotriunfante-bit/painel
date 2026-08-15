import { fillDaily } from './excelSheetDaily'
import { fillLines } from './excelSheetLines'
import { fillNetworks } from './excelSheetNetworks'
import { fillStock } from './excelSheetStock'
import { fillSummary } from './excelSheetSummary'
import type { State } from './excelMath'
import type { PanelMetrics } from './panelMetrics'
import { setNumber } from './excelXmlCore'

export function fillSheet1(document: XMLDocument, state: State, metrics: PanelMetrics) {
  const targetDays = metrics.timing.targetDays
  const worked = metrics.timing.workedDays
  setNumber(document, 'F3', targetDays)
  setNumber(document, 'F4', worked)
  fillDaily(document, state, metrics)
  fillSummary(document, metrics)
  fillStock(document, metrics)
  fillNetworks(document, metrics)
  fillLines(document, metrics)
  return { worked, targetDays }
}
