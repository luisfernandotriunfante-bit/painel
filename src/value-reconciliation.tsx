import { useEffect } from 'react'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const AUDIT_PREFIX = 'AUDITORIA: '

type RcaEntry = {
  currentCode: string
  name?: string
  coordinatorCode?: string
  coordinatorName?: string
}

type SellerValue = {
  code: string
  name?: string
  sellOut?: number
  positives?: number
  target?: number
  positiveTarget?: number
}

type DailyValue = {
  day?: number
  billed?: number
  toInvoice?: number
  sellOut?: number
  positives?: number
}

type CustomerValue = {
  cnpj?: string
  value?: number
}

type StoredState = {
  sellOut?: number
  billed?: number
  toInvoice?: number
  dailyMovement?: DailyValue[]
  salesSellerActuals?: SellerValue[]
  sellerTargets?: SellerValue[]
  salesCustomers?: CustomerValue[]
  rcaByOldCode?: Record<string, RcaEntry>
  warnings?: string[]
}

const FALLBACK_RCA_MAP: Record<string, RcaEntry> = {
  '130': { currentCode: '433' },
  '135': { currentCode: '451' },
  '211': { currentCode: '1059' },
  '301': { currentCode: '444' },
  '507': { currentCode: '416' },
  '132': { currentCode: '431' },
  '703': { currentCode: '1068' },
  '704': { currentCode: '429' },
  '705': { currentCode: '453' },
  '707': { currentCode: '437' },
  '708': { currentCode: '412' },
  '709': { currentCode: '425' },
  '710': { currentCode: '1063' },
  '711': { currentCode: '450' },
  '712': { currentCode: '1060' },
  '714': { currentCode: '1065' },
  '715': { currentCode: '442' },
  '716': { currentCode: '445' },
  '718': { currentCode: '441' },
  '721': { currentCode: '1067' },
  '757': { currentCode: '419' },
  '759': { currentCode: '413' },
  '800': { currentCode: '420' },
  '706': { currentCode: '706' },
  '752': { currentCode: '752' },
}

function cleanId(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/^0+/, '') || '0'
}

function closeEnough(a: number, b: number) {
  return Math.abs(a - b) < 0.01
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function resolveCurrent(codeValue: unknown, uploaded: Record<string, RcaEntry>) {
  const code = cleanId(codeValue)
  if (!code) return ''
  const merged = { ...FALLBACK_RCA_MAP, ...uploaded }
  const direct = merged[code]
  if (direct?.currentCode) return cleanId(direct.currentCode) || code
  const identity = Object.values(merged).find(entry => cleanId(entry.currentCode) === code)
  return identity ? code : ''
}

function normalizeSellerCodes(values: SellerValue[], uploaded: Record<string, RcaEntry>) {
  let changed = false
  const unresolved = new Set<string>()
  const next = values.map(item => {
    const original = cleanId(item.code)
    if (!original) return item
    const resolved = resolveCurrent(original, uploaded)
    if (!resolved) {
      if ((Number(item.sellOut) || Number(item.target) || Number(item.positiveTarget)) !== 0) unresolved.add(original)
      return item
    }
    if (resolved === original) return item
    changed = true
    return { ...item, code: resolved }
  })
  return { next, changed, unresolved }
}

function buildAuditWarnings(state: StoredState, unresolved: Set<string>) {
  const warnings: string[] = []
  const sellOut = Number(state.sellOut) || 0
  const billed = Number(state.billed) || 0
  const toInvoice = Number(state.toInvoice) || 0
  const dailyTotal = (state.dailyMovement ?? []).reduce((sum, item) => sum + (Number(item.sellOut) || 0), 0)
  const sellerTotal = (state.salesSellerActuals ?? []).reduce((sum, item) => sum + (Number(item.sellOut) || 0), 0)
  const customerTotal = (state.salesCustomers ?? []).reduce((sum, item) => sum + (Number(item.value) || 0), 0)

  if (!closeEnough(sellOut, billed + toInvoice)) {
    warnings.push(`${AUDIT_PREFIX}Sell Out (${brl(sellOut)}) não fecha com Faturado + A Faturar (${brl(billed + toInvoice)}).`)
  }
  if (!closeEnough(dailyTotal, sellOut)) {
    warnings.push(`${AUDIT_PREFIX}soma diária difere do Sell Out em ${brl(dailyTotal - sellOut)}.`)
  }
  if (!closeEnough(sellerTotal, sellOut)) {
    warnings.push(`${AUDIT_PREFIX}soma bruta por vendedor difere do Sell Out em ${brl(sellerTotal - sellOut)}.`)
  }
  if (!closeEnough(customerTotal, sellOut)) {
    warnings.push(`${AUDIT_PREFIX}${brl(sellOut - customerTotal)} do Sell Out não estão atribuídos a cliente/CNPJ; essa parcela não entra em redes nem positivação.`)
  }
  if (unresolved.size) {
    warnings.push(`${AUDIT_PREFIX}setores sem de/para RCA: ${[...unresolved].sort().join(', ')}. Eles continuam na base bruta, mas precisam ser incluídos em NOVOS RCAS para aparecer corretamente na Equipe.`)
  }
  return warnings
}

export function reconcileStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const state = JSON.parse(raw) as StoredState
    const uploaded = state.rcaByOldCode ?? {}

    const actuals = normalizeSellerCodes(Array.isArray(state.salesSellerActuals) ? state.salesSellerActuals : [], uploaded)
    const targets = normalizeSellerCodes(Array.isArray(state.sellerTargets) ? state.sellerTargets : [], uploaded)
    const unresolved = new Set<string>([...actuals.unresolved, ...targets.unresolved])

    const previousWarnings = Array.isArray(state.warnings) ? state.warnings.filter(item => !String(item).startsWith(AUDIT_PREFIX)) : []
    const auditWarnings = buildAuditWarnings({ ...state, salesSellerActuals: actuals.next, sellerTargets: targets.next }, unresolved)
    const nextWarnings = [...previousWarnings, ...auditWarnings]

    const warningsChanged = JSON.stringify(nextWarnings) !== JSON.stringify(state.warnings ?? [])
    if (!actuals.changed && !targets.changed && !warningsChanged) return false

    const nextState: StoredState = {
      ...state,
      salesSellerActuals: actuals.next,
      sellerTargets: targets.next,
      warnings: nextWarnings,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
    return true
  } catch (error) {
    console.error('Falha na reconciliação dos valores do painel:', error)
    return false
  }
}

export function ValueReconciliationWatcher() {
  useEffect(() => {
    let timer = 0
    let reloading = false

    const check = () => {
      if (reloading) return
      if (reconcileStoredState()) {
        reloading = true
        window.clearInterval(timer)
        window.location.reload()
      }
    }

    timer = window.setInterval(check, 900)
    return () => window.clearInterval(timer)
  }, [])

  return null
}
