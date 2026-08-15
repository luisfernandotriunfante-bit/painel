import { getNumber, setNumber } from './excelXmlCore'
import { avg3, avg3Pos, n, ratio, State, trend } from './excelMath'

export function fillStock(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const average = avg3(state)
  const dailyBase = average > 0 ? average / 30 : 0

  // Na planilha oficial, a Carteira entra pelo valor de compra/custo (L28).
  // O equivalente a preço de venda (L21) é obtido aplicando o markup do próprio
  // modelo, preservado em L24. Se o modelo vier sem esse parâmetro, usamos a
  // relação real entre posição a preço de venda e posição a custo.
  const transitCost = n(state.stockTransit)
  const fallbackMarkup = n(state.positionCost) > 0 ? n(state.positionSale) / n(state.positionCost) - 1 : 0
  const markup = getNumber(document, 'L24', fallbackMarkup)
  const transitSale = transitCost * (1 + markup)

  const saleCoverage = dailyBase ? n(state.positionSale) / dailyBase : 0
  const costCoverage = dailyBase ? n(state.positionCost) / dailyBase : 0

  setNumber(document, 'L19', n(state.positionSale))
  setNumber(document, 'L20', saleCoverage)
  setNumber(document, 'M20', 60)
  setNumber(document, 'N20', 60 - saleCoverage)
  setNumber(document, 'L21', transitSale)
  setNumber(document, 'L22', n(state.positionSale) + transitSale)
  setNumber(document, 'L23', dailyBase ? (n(state.positionSale) + transitSale) / dailyBase : 0)

  setNumber(document, 'L26', n(state.positionCost))
  setNumber(document, 'L27', costCoverage)
  setNumber(document, 'M27', 60)
  setNumber(document, 'N27', 60 - costCoverage)
  setNumber(document, 'L28', transitCost)
  setNumber(document, 'L29', n(state.positionCost) + transitCost)
  setNumber(document, 'L30', dailyBase ? (n(state.positionCost) + transitCost) / dailyBase : 0)

  const positiveTarget = n(state.industryPositiveTarget)
  const positives = n(state.potentialPositives)
  const positiveTrend = trend(positives, worked, targetDays)
  setNumber(document, 'L33', positiveTarget)
  setNumber(document, 'L34', positives)
  setNumber(document, 'M34', ratio(positives, positiveTarget))
  setNumber(document, 'L35', positiveTrend)
  setNumber(document, 'M35', ratio(positiveTrend, positiveTarget))
  setNumber(document, 'L36', avg3Pos(state))
  setNumber(document, 'M36', ratio(avg3Pos(state), positiveTarget))
}
