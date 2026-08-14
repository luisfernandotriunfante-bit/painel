export const TRANSIT_DETAIL_KEY = 'painel-sell-out-milenio:transit-value-by-code:v1'
export const TRANSIT_DIAGNOSTIC_KEY = 'painel-sell-out-milenio:transit-diagnostic:v1'

type Finance = { cost?: number; sale?: number }

export type TransitDiagnostic = {
  materialHeader: string
  valueHeader: string
  identifiedSkus: number
  codedValue: number
  rowsWithoutCode: number
  valueWithoutCode: number
  sampleTransitCodes: string[]
}

export type TransitSaleValuation = {
  saleValue: number
  mappedCost: number
  unmappedCost: number
  mappedSkus: number
  unmappedSkus: string[]
}

export function readTransitValueByCode(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TRANSIT_DETAIL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function readTransitDiagnostic(): TransitDiagnostic | null {
  try {
    const raw = localStorage.getItem(TRANSIT_DIAGNOSTIC_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function valueTransitAtSale(valueByCode: Record<string, number>, financeByCode: Record<string, Finance>): TransitSaleValuation {
  let saleValue = 0
  let mappedCost = 0
  let unmappedCost = 0
  let mappedSkus = 0
  const unmappedSkus: string[] = []

  for (const [code, rawValue] of Object.entries(valueByCode ?? {})) {
    const value = Number(rawValue) || 0
    if (!value) continue
    const finance = financeByCode?.[code]
    const cost = Number(finance?.cost) || 0
    const sale = Number(finance?.sale) || 0
    if (cost > 0 && sale > 0) {
      saleValue += value * (sale / cost)
      mappedCost += value
      mappedSkus += 1
    } else {
      unmappedCost += value
      unmappedSkus.push(code)
    }
  }

  return { saleValue, mappedCost, unmappedCost, mappedSkus, unmappedSkus }
}
