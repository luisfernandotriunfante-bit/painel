import { readTransitValueByCode, valueTransitAtSale } from './transitValuation'

export const STORAGE_KEY='painel-sell-out-milenio:v3'

export function loadState(){
  const raw=localStorage.getItem(STORAGE_KEY)
  if(!raw)throw new Error('Carregue e processe as bases do painel antes de gerar o Excel.')
  const state=JSON.parse(raw)
  const valuation=valueTransitAtSale(readTransitValueByCode(),state.positionFinanceByCode??{})
  return {
    ...state,
    stockTransitSale:valuation.saleValue,
    stockTransitSaleMappedCost:valuation.mappedCost,
    stockTransitSaleUnmappedCost:valuation.unmappedCost,
    stockTransitSaleMappedSkus:valuation.mappedSkus,
    stockTransitSaleUnmappedSkus:valuation.unmappedSkus,
  }
}
