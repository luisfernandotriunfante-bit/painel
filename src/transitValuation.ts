import { readProductCodeBridge } from './productCodeBridge'
import { normalizeProductDescription, readTransitProductDetail } from './transitDescriptionBridge'

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
  directSkus: number
  bridgedSkus: number
  descriptionSkus: number
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
  positionItems: PositionItem[] = [],
): TransitSaleValuation {
  let saleValue = 0
  let mappedCost = 0
  let unmappedCost = 0
  let mappedSkus = 0
  let directSkus = 0
  let bridgedSkus = 0
  let descriptionSkus = 0
  const unmappedSkus: string[] = []
  const bridge = readProductCodeBridge()
  const transitDetail = readTransitProductDetail()

  const descriptionIndex = new Map<string, PositionItem[]>()
  for (const item of positionItems ?? []) {
    const key = normalizeProductDescription(item.description)
    if (!key) continue
    const bucket = descriptionIndex.get(key) ?? []
    bucket.push(item)
    descriptionIndex.set(key, bucket)
  }

  for (const [code, rawValue] of Object.entries(valueByCode ?? {})) {
    const value = Number(rawValue) || 0
    if (!value) continue

    let pair = financePair(financeByCode?.[code])
    let method: 'direct' | 'bridge' | 'description' | '' = pair ? 'direct' : ''

    if (!pair) {
      const canonical = bridge[code]
      if (canonical) {
        pair = financePair(financeByCode?.[canonical])
        if (pair) method = 'bridge'
      }
    }

    if (!pair) {
      const description = normalizeProductDescription(transitDetail[code]?.description)
      const matches = description ? (descriptionIndex.get(description) ?? []) : []
      if (matches.length === 1) {
        const item = matches[0]
        pair = financePair({
          cost: Number(item.costUnit) || Number(financeByCode?.[String(item.code ?? '')]?.cost) || 0,
          sale: Number(item.saleUnit) || Number(financeByCode?.[String(item.code ?? '')]?.sale) || 0,
        })
        if (pair) method = 'description'
      }
    }

    if (pair) {
      saleValue += value * (pair.sale / pair.cost)
      mappedCost += value
      mappedSkus += 1
      if (method === 'direct') directSkus += 1
      if (method === 'bridge') bridgedSkus += 1
      if (method === 'description') descriptionSkus += 1
    } else {
      unmappedCost += value
      unmappedSkus.push(code)
    }
  }

  return { saleValue, mappedCost, unmappedCost, mappedSkus, unmappedSkus, directSkus, bridgedSkus, descriptionSkus }
}
