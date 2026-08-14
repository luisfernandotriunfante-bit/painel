export const PRODUCT_LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const
export type ProductLineName = typeof PRODUCT_LINE_NAMES[number]
export type ProductLineChoice = ProductLineName | 'Outros'

export type UnclassifiedProduct = {
  code: string
  description: string
  value: number
}

const MAP_KEY = 'painel-sell-out-milenio:product-line-map'
const UNCLASSIFIED_KEY = 'painel-sell-out-milenio:product-line-unclassified'

export function normalizeProductCode(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits || raw.toUpperCase().replace(/\s+/g, ' ')
}

export function readProductLineMap(): Record<string, ProductLineChoice> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeProductLineMap(map: Record<string, ProductLineChoice>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MAP_KEY, JSON.stringify(map))
}

export function readUnclassifiedProducts(): UnclassifiedProduct[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(UNCLASSIFIED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeUnclassifiedProducts(items: UnclassifiedProduct[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(UNCLASSIFIED_KEY, JSON.stringify(items))
}
