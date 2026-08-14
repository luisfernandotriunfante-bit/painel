import { cleanId, normalizeText } from './data'

export const PRODUCT_CODE_BRIDGE_KEY = 'painel-sell-out-milenio:product-code-bridge:v1'
export const PRODUCT_CODE_BRIDGE_DIAG_KEY = 'painel-sell-out-milenio:product-code-bridge-diag:v1'

export type ProductCodeBridge = Record<string, string>

export type ProductCodeBridgeDiagnostics = {
  source: string
  rows: number
  codeColumns: string[]
  canonicalColumn: string
  aliases: number
  examples: string[]
}

export function readProductCodeBridge(): ProductCodeBridge {
  try {
    const raw = localStorage.getItem(PRODUCT_CODE_BRIDGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function readProductCodeBridgeDiagnostics(): ProductCodeBridgeDiagnostics | null {
  try {
    const raw = localStorage.getItem(PRODUCT_CODE_BRIDGE_DIAG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function codeKey(value: unknown) {
  return cleanId(value)
}

export function isLikelyProductCodeHeader(value: unknown) {
  const h = normalizeText(value)
  if (!h) return false
  return [
    'COD', 'CODIGO', 'COD PRODUTO', 'CODIGO PRODUTO', 'CODPROD', 'COD PROD',
    'COD FAB', 'COD FABRICA', 'COD FABRICANTE', 'CODIGO FABRICANTE',
    'COD FORN', 'COD FORNECEDOR', 'CODIGO FORNECEDOR',
    'REFERENCIA', 'REF', 'REF FABRICA', 'REF FORNECEDOR',
    'MATERIAL', 'MATERIAL NUMBER', 'MATERIAL CODE', 'COD MATERIAL', 'CODIGO MATERIAL',
    'SKU', 'SKU FORNECEDOR', 'SKU FABRICANTE', 'SAP', 'COD SAP', 'CODIGO SAP',
  ].some(alias => h === alias || h.includes(alias))
}

export function saveProductCodeBridge(bridge: ProductCodeBridge, diagnostics: ProductCodeBridgeDiagnostics) {
  try {
    localStorage.setItem(PRODUCT_CODE_BRIDGE_KEY, JSON.stringify(bridge))
    localStorage.setItem(PRODUCT_CODE_BRIDGE_DIAG_KEY, JSON.stringify(diagnostics))
  } catch {
    // De/para é uma otimização. O painel continua funcionando mesmo sem persistência.
  }
}
