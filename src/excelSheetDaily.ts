import { clearCell, setNumber, setText } from './excelXmlCore'
import { excelSerial, monthName, officialHolidays, State } from './excelMath'
import type { PanelMetrics } from './panelMetrics'

export function fillDaily(document: XMLDocument, state: State, metrics: PanelMetrics) {
  const days = new Date(metrics.period.year, metrics.period.month, 0).getDate()
  const generated = new Date(metrics.period.updatedAt)

  setNumber(document, 'G1', excelSerial(metrics.period.year, metrics.period.month, 1))
  setNumber(document, 'G2', excelSerial(metrics.period.year, metrics.period.month, days))
  setNumber(document, 'E5', excelSerial(generated.getFullYear(), generated.getMonth() + 1, generated.getDate(), generated.getHours(), generated.getMinutes(), generated.getSeconds()))
  setNumber(document, 'G5', excelSerial(generated.getFullYear(), generated.getMonth() + 1, generated.getDate()))
  setText(document, 'E6', monthName(metrics.period.year, metrics.period.month))

  setNumber(document, 'U1', metrics.period.year)
  officialHolidays(metrics.period.year).forEach((holiday, index) => {
    setNumber(document, `T${2 + index}`, excelSerial(holiday.getFullYear(), holiday.getMonth() + 1, holiday.getDate()))
  })

  for (let index = 0; index < 31; index += 1) {
    const row = 8 + index
    const day = index + 1
    if (day > days) {
      for (const column of ['C', 'D', 'E', 'F', 'G']) clearCell(document, `${column}${row}`)
      continue
    }

    const movement = metrics.daily.find(item => item.day === day)
    setNumber(document, `C${row}`, excelSerial(metrics.period.year, metrics.period.month, day))
    setText(document, `D${row}`, new Date(metrics.period.year, metrics.period.month - 1, day).toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, letter => letter.toUpperCase()))
    setNumber(document, `E${row}`, movement?.sellOut ?? 0)
    setNumber(document, `F${row}`, movement?.billed ?? 0)
    setNumber(document, `G${row}`, movement?.positives ?? 0)
  }

  const audit = metrics.reconciliation
  setNumber(document, 'E39', audit.dailySellOut)
  setNumber(document, 'F39', audit.dailyBilled)
  setNumber(document, 'G39', audit.dailyPositives)
  setNumber(document, 'F40', audit.consolidatedBilled)
  setNumber(document, 'G40', audit.consolidatedPositives)
  setNumber(document, 'E41', audit.sellOutVsBilled)
  setNumber(document, 'F41', audit.billedDelta)
  setNumber(document, 'G41', audit.positiveDelta)
}
