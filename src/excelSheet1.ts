import { fillDaily } from './excelSheetDaily'
import { fillLines } from './excelSheetLines'
import { fillNetworks } from './excelSheetNetworks'
import { fillStock } from './excelSheetStock'
import { fillSummary } from './excelSheetSummary'
import { State, throughDay, weekdays } from './excelMath'
import { setNumber } from './excelXmlCore'

export function fillSheet1(document: XMLDocument, state: State) {
  const days = new Date(state.periodYear, state.periodMonth, 0).getDate()
  const targetDays = state.workingDaysTarget > 0 ? state.workingDaysTarget : weekdays(state.periodYear, state.periodMonth, days)
  const worked = Math.max(1, weekdays(state.periodYear, state.periodMonth, throughDay(state.periodYear, state.periodMonth)))
  setNumber(document, 'F3', targetDays)
  setNumber(document, 'F4', worked)
  fillDaily(document, state)
  fillSummary(document, state, worked, targetDays)
  fillStock(document, state, worked, targetDays)
  fillNetworks(document, state, worked, targetDays)
  fillLines(document, state, worked, targetDays)
  return { worked, targetDays }
}
