import { clearCell, setNumber, setText } from './excelXmlCore'
import { excelSerial, monthName, n, officialHolidays, State } from './excelMath'

export function fillDaily(document: XMLDocument, state: State) {
  const days = new Date(state.periodYear, state.periodMonth, 0).getDate()
  const now = new Date()

  setNumber(document, 'G1', excelSerial(state.periodYear, state.periodMonth, 1))
  setNumber(document, 'G2', excelSerial(state.periodYear, state.periodMonth, days))
  setNumber(document, 'E5', excelSerial(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()))
  setNumber(document, 'G5', excelSerial(now.getFullYear(), now.getMonth() + 1, now.getDate()))
  setText(document, 'E6', monthName(state.periodYear, state.periodMonth))

  // A planilha FORMULA usa T2:T17 como calendário oficial de feriados.
  // Materializamos as mesmas datas para que o modelo sem fórmulas permaneça
  // coerente com a competência carregada no painel.
  setNumber(document, 'U1', state.periodYear)
  officialHolidays(state.periodYear).forEach((holiday, index) => {
    setNumber(document, `T${2 + index}`, excelSerial(holiday.getFullYear(), holiday.getMonth() + 1, holiday.getDate()))
  })

  for (let index = 0; index < 31; index += 1) {
    const row = 8 + index
    const day = index + 1
    if (day > days) {
      for (const column of ['C', 'D', 'E', 'F', 'G']) clearCell(document, `${column}${row}`)
      continue
    }

    const movement = state.dailyMovement?.find((item: any) => item.day === day) ?? {}
    setNumber(document, `C${row}`, excelSerial(state.periodYear, state.periodMonth, day))
    setText(document, `D${row}`, new Date(state.periodYear, state.periodMonth - 1, day).toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, (letter: string) => letter.toUpperCase()))
    setNumber(document, `E${row}`, n(movement.sellOut))
    setNumber(document, `F${row}`, n(movement.billed))
    setNumber(document, `G${row}`, n(movement.positives))
  }

  const dailySellOut = (state.dailyMovement ?? []).reduce((sum: number, item: any) => sum + n(item.sellOut), 0)
  const dailyBilled = (state.dailyMovement ?? []).reduce((sum: number, item: any) => sum + n(item.billed), 0)
  const dailyPositives = (state.dailyMovement ?? []).reduce((sum: number, item: any) => sum + n(item.positives), 0)

  // E39:G41 reproduzem a área de conferência do modelo FORMULA:
  // linha 39 = soma do movimento diário; linha 40 = total consolidado da base;
  // linha 41 = diferença entre as duas leituras.
  setNumber(document, 'E39', dailySellOut)
  setNumber(document, 'F39', dailyBilled)
  setNumber(document, 'G39', dailyPositives)
  setNumber(document, 'F40', n(state.billed))
  setNumber(document, 'G40', n(state.potentialPositives))
  setNumber(document, 'E41', dailySellOut - dailyBilled)
  setNumber(document, 'F41', n(state.billed) - dailyBilled)
  setNumber(document, 'G41', n(state.potentialPositives) - dailyPositives)
}
