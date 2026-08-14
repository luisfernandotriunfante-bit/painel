import { clearCell, setNumber, setText } from './excelXmlCore'
import { excelSerial, monthName, n, State } from './excelMath'

export function fillDaily(document: XMLDocument, state: State) {
  const days = new Date(state.periodYear, state.periodMonth, 0).getDate()
  const now = new Date()

  setNumber(document, 'G1', excelSerial(state.periodYear, state.periodMonth, 1))
  setNumber(document, 'G2', excelSerial(state.periodYear, state.periodMonth, days))
  setNumber(document, 'E5', excelSerial(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()))
  setNumber(document, 'G5', excelSerial(now.getFullYear(), now.getMonth() + 1, now.getDate()))
  setText(document, 'E6', monthName(state.periodYear, state.periodMonth))

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
    // O modelo da indústria trata esta coluna como positivação efetivamente faturada.
    // "Somente a faturar" permanece disponível no painel/equipe, mas não infla o realizado diário.
    setNumber(document, `G${row}`, n(movement.billedPositives ?? movement.positives))
  }

  setNumber(document, 'E39', n(state.sellOut))
  setNumber(document, 'F39', n(state.billed))
  setNumber(document, 'G39', n(state.billedPositives ?? state.potentialPositives))
  setNumber(document, 'E41', n(state.toInvoice))
  setNumber(document, 'F41', 0)
  setNumber(document, 'G41', 0)
}
