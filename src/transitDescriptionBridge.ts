export const TRANSIT_PRODUCT_DETAIL_KEY = 'painel-sell-out-milenio:transit-product-detail:v1'

export type TransitProductDetail = Record<string, { value: number; description: string }>

export function normalizeProductDescription(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\b(UN|UND|UNID|UNIDADE|CX|CAIXA|PC|PCT|PACOTE|DISPLAY)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function saveTransitProductDetail(detail: TransitProductDetail) {
  try { localStorage.setItem(TRANSIT_PRODUCT_DETAIL_KEY, JSON.stringify(detail)) } catch { /* opcional */ }
}

export function readTransitProductDetail(): TransitProductDetail {
  try {
    const raw = localStorage.getItem(TRANSIT_PRODUCT_DETAIL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
