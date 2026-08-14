import { clearCell, setNumber } from './excelXmlCore'
import { avg3, avg3Pos, n, ratio, State, trend } from './excelMath'

export function fillStock(document: XMLDocument, state: State, worked: number, targetDays: number) {
  const average = avg3(state)
  const dailyBase = average > 0 ? average / 30 : 0

  // Regra oficial do painel: a Carteira (Net Value / ZINV) entra no bloco de custo.
  // Não existe hoje uma fonte oficial para converter a carteira para preço de venda,
  // portanto nenhuma estimativa proporcional é criada no Excel.
  const transitCost = n(state.stockTransit)
  const physicalSale = n(state.positionSale)
  const physicalCost = n(state.positionCost)
  const saleCoverage = dailyBase ? physicalSale / dailyBase : 0
  const costCoverage = dailyBase ? physicalCost / dailyBase : 0
  const costWithTransit = physicalCost + transitCost
  const costWithTransitCoverage = dailyBase ? costWithTransit / dailyBase : 0

  // Estoque a preço de venda: somente posição física do 105.
  setNumber(document, 'L19', physicalSale)
  setNumber(document, 'L20', saleCoverage)
  setNumber(document, 'M20', 60)
  setNumber(document, 'N20', 60 - saleCoverage)
  clearCell(document, 'L21')
  setNumber(document, 'L22', physicalSale)
  setNumber(document, 'L23', saleCoverage)

  // Estoque ao custo: posição física + Carteira/ZINV.
  setNumber(document, 'L26', physicalCost)
  setNumber(document, 'L27', costCoverage)
  setNumber(document, 'M27', 60)
  setNumber(document, 'N27', 60 - costCoverage)
  setNumber(document, 'L28', transitCost)
  setNumber(document, 'L29', costWithTransit)
  setNumber(document, 'L30', costWithTransitCoverage)

  const positiveTarget = n(state.sellOutPositiveTarget)
  // A meta geral de positivação do Sell Out mede clientes efetivamente faturados.
  // Clientes somente "a faturar" continuam como potencial e não entram no realizado deste bloco.
  const positives = n(state.billedPositives ?? state.potentialPositives)
  const positiveTrend = trend(positives, worked, targetDays)
  const positiveAverage = avg3Pos(state)

  if (positiveTarget > 0) {
    setNumber(document, 'L33', positiveTarget)
    setNumber(document, 'M34', ratio(positives, positiveTarget))
    setNumber(document, 'M35', ratio(positiveTrend, positiveTarget))
    setNumber(document, 'M36', ratio(positiveAverage, positiveTarget))
  } else {
    clearCell(document, 'L33')
    clearCell(document, 'M34')
    clearCell(document, 'M35')
    clearCell(document, 'M36')
  }

  setNumber(document, 'L34', positives)
  setNumber(document, 'L35', positiveTrend)
  setNumber(document, 'L36', positiveAverage)
}
