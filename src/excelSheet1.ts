import { fillDaily } from './excelSheetDaily'
import { fillLines } from './excelSheetLines'
import { fillNetworks } from './excelSheetNetworks'
import { fillStock } from './excelSheetStock'
import { fillSummary } from './excelSheetSummary'
import { officialWorkedDays, officialWorkingDays, State } from './excelMath'
import { setNumber } from './excelXmlCore'

export function fillSheet1(document: XMLDocument, state: State) {
  const targetDays = officialWorkingDays(state.periodYear, state.periodMonth)
  const worked = officialWorkedDays(state.periodYear, state.periodMonth)
  setNumber(document, 'F3', targetDays)
  setNumber(document, 'F4', worked)
  fillDaily(document, state)
  fillSummary(document, state, worked, targetDays)
  fillStock(document, state, worked, targetDays)
  fillNetworks(document, state, worked, targetDays)
  fillLines(document, state, worked, targetDays)
  return { worked, targetDays }
}
