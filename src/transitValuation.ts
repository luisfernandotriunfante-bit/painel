import { readProductCodeBridge } from './productCodeBridge'

export const TRANSIT_DETAIL_KEY = 'painel-sell-out-milenio:transit-value-by-code:v1'
export const TRANSIT_DIAGNOSTIC_KEY = 'painel-sell-out-milenio:transit-diagnostic:v1'

type Finance = { cost?: number; sale?: number }
type PositionItem = { code?: string; description?: string; costUnit?: number; saleUnit?: number }

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
  /** Campos legados mantidos para compatibilidade; o motor oficial não usa esses métodos. */
  directSkus: number
  supplierSkus: number
  bridgedSkus: number
  descriptionSkus: number
  missingIn286Skus: string[]
  missingIn286Cost: number
  mappedIn286MissingFinanceSkus: string[]
  mappedIn286MissingFinanceCost: number
  directMissingFinanceSkus: string[]
  directMissingFinanceCost: number
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

function financePair(finance?: Finance) {
  const cost = Number(finance?.cost) || 0
  const sale = Number(finance?.sale) || 0
  return cost > 0 && sale > 0 ? { cost, sale } : null
}

export function valueTransitAtSale(
  valueByCode: Record<string, number>,
  financeByCode: Record<string, Finance>,
  _positionItems: PositionItem[] = [],
): TransitSaleValuation {
  let saleValue = 0
  let mappedCost = 0
  let unmappedCost = 0
  let mappedSkus = 0
  let bridgedSkus = 0
  let missingIn286Cost = 0
  let mappedIn286MissingFinanceCost = 0
  const unmappedSkus: string[] = []
  const missingIn286Skus: string[] = []
  const mappedIn286MissingFinanceSkus: string[] = []
  const bridge = readProductCodeBridge()

  for (const [material, rawValue] of Object.entries(valueByCode ?? {})) {
    const value = Number(rawValue) || 0
    if (!value) continue

    // Regra oficial validada:
    // Carteira.Material é código da indústria e NUNCA é comparado diretamente
    // com 105.Código. O vínculo obrigatório é:
    // Carteira.Material -> 286.Fábrica -> 286.Código interno -> 105.Código.
    const internalCode = bridge[material] || ''
    const pair = internalCode ? financePair(financeByCode?.[internalCode]) : null

    if (pair) {
      saleValue += value * (pair.sale / pair.cost)
      mappedCost += value
      mappedSkus += 1
      bridgedSkus += 1
      continue
    }

    unmappedCost += value
    unmappedSkus.push(material)

    if (internalCode) {
      mappedIn286MissingFinanceSkus.push(material)
      mappedIn286MissingFinanceCost += value
    } else {
      missingIn286Skus.push(material)
      missingIn286Cost += value
    }
  }

  return {
    saleValue,
    mappedCost,
    unmappedCost,
    mappedSkus,
    unmappedSkus,
    directSkus: 0,
    supplierSkus: 0,
    bridgedSkus,
    descriptionSkus: 0,
    missingIn286Skus,
    missingIn286Cost,
    mappedIn286MissingFinanceSkus,
    mappedIn286MissingFinanceCost,
    directMissingFinanceSkus: [],
    directMissingFinanceCost: 0,
  }
}
