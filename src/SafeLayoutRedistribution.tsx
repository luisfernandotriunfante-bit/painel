import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { mergeSellers, RcaEntry, SellerSales, SellerTarget } from './data'
import type { PositionItem } from './enhancedData'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const RETURN_PAGE_KEY = 'painel-sell-out-milenio:return-page'
const LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const

type ProductLineName = typeof LINE_NAMES[number]
type SellerWithLines = SellerSales & { lineSales?: Partial<Record<ProductLineName, number>> }
type StoredCustomer = { cnpj: string; value: number; billed?: number; toInvoice?: number }
type NetworkTarget = { target: number; locked: boolean }
type UploadMeta = { updatedAt?: string } | null

type StoredState = {
  periodYear?: number
  periodMonth?: number
  sellOut?: number
  billed?: number
  toInvoice?: number
  uploads?: {
    sales?: UploadMeta
    rcas?: UploadMeta
    position?: UploadMeta
    transit?: UploadMeta
    targets?: UploadMeta
    history?: UploadMeta
  }
  salesSellerActuals?: SellerWithLines[]
  sellerTargets?: SellerTarget[]
  salesCustomers?: StoredCustomer[]
  rcaByOldCode?: Record<string, RcaEntry>
  networkByCnpj?: Record<string, string>
  historyByMonth?: Record<string, Record<string, number>>
  strategicNetworks?: string[]
  networkTargets?: Record<string, NetworkTarget>
  networkPoolTarget?: number
  industryTarget?: number
  positionCost?: number
  positionSale?: number
  positionRows?: number
  positionItems?: PositionItem[]
  stockTransit?: number
}

type NetworkRow = {
  name: string
  customers: number
  billed: number
  toInvoice: number
  sellOut: number
  previous: number
  target: number
  locked: boolean
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

function readStoredState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function pageFromLabel(label: string) {
  return label.trim().toLowerCase()
}

function readActivePage() {
  const active = [...document.querySelectorAll<HTMLButtonElement>('.tabs button:not(.safe-virtual-tab)')]
    .find(button => button.classList.contains('active'))
  return pageFromLabel(active?.textContent ?? 'Resumo')
}

function findTab(label: string) {
  const wanted = label.toLowerCase()
  return [...document.querySelectorAll<HTMLButtonElement>('.tabs button:not(.safe-virtual-tab)')]
    .find(button => pageFromLabel(button.textContent ?? '') === wanted)
}

function moduleForPage(page: string) {
  if (page === 'estoque') return 'stock'
  if (page === 'metas' || page === 'conferência' || page === 'conferencia' || page === 'upload de dados' || page === 'upload') return 'config'
  return 'sellout'
}

function previousMonthKey(state: StoredState) {
  const year = Number(state.periodYear) || new Date().getFullYear()
  const month = Number(state.periodMonth) || new Date().getMonth() + 1
  return `${year - 1}-${String(month).padStart(2, '0')}`
}

function networkRowsFromStoredState(state: StoredState): NetworkRow[] {
  const selected = state.strategicNetworks?.length ? state.strategicNetworks : ['ABV', 'MEGA', 'PIRES', 'NOVA ESTRELA', 'PORTAL / PRINCESA']
  const current = new Map<string, { billed: number; toInvoice: number; sellOut: number; customers: Set<string> }>()
  selected.forEach(name => current.set(name, { billed: 0, toInvoice: 0, sellOut: 0, customers: new Set<string>() }))

  for (const customer of state.salesCustomers ?? []) {
    const network = state.networkByCnpj?.[customer.cnpj]
    const bucket = network ? current.get(network) : undefined
    if (!bucket) continue
    const billed = Number(customer.billed) || 0
    const toInvoice = Number(customer.toInvoice) || 0
    const sellOut = Number(customer.value) || billed + toInvoice
    bucket.billed += billed
    bucket.toInvoice += toInvoice
    bucket.sellOut += sellOut
    bucket.customers.add(customer.cnpj)
  }

  const previousByCnpj = state.historyByMonth?.[previousMonthKey(state)] ?? {}
  const previous = new Map<string, number>()
  selected.forEach(name => previous.set(name, 0))
  for (const [cnpj, value] of Object.entries(previousByCnpj)) {
    const network = state.networkByCnpj?.[cnpj]
    if (!network || !previous.has(network)) continue
    previous.set(network, (previous.get(network) ?? 0) + Number(value || 0))
  }

  return selected.map(name => ({
    name,
    customers: current.get(name)?.customers.size ?? 0,
    billed: current.get(name)?.billed ?? 0,
    toInvoice: current.get(name)?.toInvoice ?? 0,
    sellOut: current.get(name)?.sellOut ?? 0,
    previous: previous.get(name) ?? 0,
    target: Number(state.networkTargets?.[name]?.target) || 0,
    locked: Boolean(state.networkTargets?.[name]?.locked),
  }))
}

function parseCurrency(raw: string) {
  const cleaned = raw.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : 0
}

function CurrencyEditor({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    if (!editing) setDraft(money.format(value))
  }, [value, editing])
  return <input
    className="currency-input safe-network-currency"
    value={editing ? draft : money.format(value)}
    onFocus={() => { setEditing(true); setDraft(value.toFixed(2).replace('.', ',')) }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const parsed = parseCurrency(draft)
      onChange(parsed)
      setEditing(false)
    }}
  />
}

function ProductLineSummary({ state }: { state: StoredState }) {
  const totals = useMemo(() => {
    const result: Record<ProductLineName, number> = {
      'Creme Dental': 0,
      'Esc + Enx + Fio': 0,
      'Sabonetes': 0,
      Hair: 0,
      Limpeza: 0,
    }
    for (const seller of state.salesSellerActuals ?? []) {
      for (const line of LINE_NAMES) result[line] += Number(seller.lineSales?.[line]) || 0
    }
    return result
  }, [state.salesSellerActuals])

  const labels: Record<ProductLineName, string> = {
    'Creme Dental': 'CREME DENTAL',
    'Esc + Enx + Fio': 'ESC + ENX + FIO',
    Sabonetes: 'SABONETES',
    Hair: 'HAIR',
    Limpeza: 'LIMPEZA',
  }

  return <section className="panel section-block safe-product-lines">
    <div className="section-bar safe-titlebar">
      <div><span>SELL OUT POR LINHA</span><h2>5 linhas de produto</h2></div>
      <div className="status-pill warn">Critério EAN a validar</div>
    </div>
    <div className="safe-five-metrics">
      {LINE_NAMES.map((line, index) => <article className={`metric ${index === 0 ? 'red' : ''}`} key={line}>
        <span>{labels[line]}</span>
        <strong>{state.uploads?.sales ? money.format(totals[line]) : '—'}</strong>
        <small>{state.sellOut ? percent.format(totals[line] / state.sellOut) : '—'} do Sell Out</small>
      </article>)}
    </div>
    <div className="safe-note">Prévia mantida pelo agrupamento/descrição do 8022. A classificação definitiva será fechada por EAN depois da validação do vínculo de cada produto.</div>
  </section>
}

function StockSummary({ state }: { state: StoredState }) {
  const hasPosition = Boolean(state.positionRows)
  const physical = Math.max(0, Number(state.positionCost) || 0)
  const transit = Math.max(0, Number(state.stockTransit) || 0)
  const combined = physical + transit
  const physicalPct = combined > 0 ? physical / combined * 100 : 0
  const transitPct = combined > 0 ? transit / combined * 100 : 0
  const topItems = useMemo(() => [...(state.positionItems ?? [])]
    .sort((a, b) => b.costValue - a.costValue)
    .slice(0, 6), [state.positionItems])

  const positionUpdated = state.uploads?.position?.updatedAt ? new Date(state.uploads.position.updatedAt).toLocaleString('pt-BR') : '—'
  const transitUpdated = state.uploads?.transit?.updatedAt ? new Date(state.uploads.transit.updatedAt).toLocaleString('pt-BR') : '—'

  return <section className="panel section-block safe-stock-summary">
    <div className="section-bar"><div><span>RESUMO DO ESTOQUE</span><h2>Posição financeira consolidada</h2></div></div>
    <div className="metrics enhanced-metrics four safe-stock-kpis">
      <article className="metric red"><span>ESTOQUE ATUAL AO CUSTO</span><strong>{hasPosition ? money.format(physical) : '—'}</strong></article>
      <article className="metric navy"><span>ABASTECIMENTO EM TRÂNSITO</span><strong>{state.uploads?.transit ? money.format(transit) : '—'}</strong></article>
      <article className="metric"><span>POSIÇÃO AO CUSTO + TRÂNSITO</span><strong>{hasPosition ? money.format(combined) : '—'}</strong></article>
      <article className="metric"><span>ESTOQUE A PREÇO DE VENDA</span><strong>{hasPosition ? money.format(Number(state.positionSale) || 0) : '—'}</strong></article>
    </div>

    <div className="safe-stock-insights">
      <article className="safe-stock-chart-card">
        <div className="safe-insight-heading"><span>COMPOSIÇÃO</span><strong>Físico x carteira</strong></div>
        <div className="safe-stock-total">{combined ? money.format(combined) : '—'}<small>posição ao custo + trânsito</small></div>
        <div className="safe-stock-stack" aria-label="Composição do estoque e carteira">
          <i className="physical" style={{ width: `${physicalPct}%` }} />
          <i className="transit" style={{ width: `${transitPct}%` }} />
        </div>
        <div className="safe-stock-legend">
          <div><i className="physical" /><span>Estoque físico</span><strong>{money.format(physical)}</strong><small>{percent.format(physicalPct / 100)}</small></div>
          <div><i className="transit" /><span>Carteira</span><strong>{money.format(transit)}</strong><small>{percent.format(transitPct / 100)}</small></div>
        </div>
      </article>

      <article className="safe-stock-top-card">
        <div className="safe-insight-heading"><span>CONCENTRAÇÃO</span><strong>Maiores posições por SKU</strong></div>
        {topItems.length ? <div className="safe-stock-mini-table"><table><thead><tr><th>SKU</th><th>Produto</th><th>Qtd.</th><th>Estoque custo</th></tr></thead><tbody>{topItems.map((item, index) => <tr key={`${item.code}-${index}`}><td><b>{item.code}</b></td><td>{item.description}</td><td>{integer.format(item.units)}</td><td><strong>{money.format(item.costValue)}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state compact-empty">Carregue o 105 para analisar a concentração por SKU.</div>}
      </article>
    </div>

    <div className="safe-stock-source-strip">
      <div><span>ÚLTIMA POSIÇÃO FÍSICA</span><strong>{positionUpdated}</strong></div>
      <div><span>ÚLTIMA CARTEIRA</span><strong>{transitUpdated}</strong></div>
      <div className="safe-arrival-note"><span>CHEGADAS DE MATERIAL</span><strong>Aguardando fonte com data de recebimento por item</strong><small>Os arquivos 105 e Carteira atuais permitem posição e trânsito, mas não uma data de entrada confiável por SKU.</small></div>
    </div>
  </section>
}

function TeamGerencial({ state }: { state: StoredState }) {
  const sellers = useMemo(() => mergeSellers(
    state.sellerTargets ?? [],
    state.salesSellerActuals ?? [],
    state.rcaByOldCode ?? {},
  ), [state.sellerTargets, state.salesSellerActuals, state.rcaByOldCode])

  const total = sellers.reduce((sum, seller) => sum + seller.sellOut, 0)
  const positives = sellers.reduce((sum, seller) => sum + seller.positives, 0)
  const industryTarget = Number(state.industryTarget) || 0

  return <div className="safe-team-block">
    <section className="metrics enhanced-metrics four safe-team-kpis">
      <article className="metric red"><span>SELL OUT IDENTIFICADO</span><strong>{state.uploads?.sales ? money.format(total) : '—'}</strong></article>
      <article className="metric"><span>POSITIVAÇÕES POR RCA</span><strong>{state.uploads?.sales ? integer.format(positives) : '—'}</strong></article>
      <article className="metric"><span>RCAS COM MOVIMENTO</span><strong>{state.uploads?.sales ? integer.format(sellers.filter(item => item.sellOut !== 0).length) : '—'}</strong></article>
      <article className="metric navy"><span>RCAS MAPEADOS</span><strong>{state.uploads?.rcas ? integer.format(Object.keys(state.rcaByOldCode ?? {}).length) : '—'}</strong></article>
    </section>

    <section className="panel section-block safe-team-panel">
      <div className="section-bar"><div><span>EQUIPE & METAS</span><h2>Realizado, meta e positivação por RCA</h2></div></div>
      {sellers.length ? <div className="table-scroll"><table>
        <thead><tr><th>RCA</th><th>Vendedor</th><th>Meta</th><th>Participação da meta</th><th>Sell Out</th><th>Positivação</th><th>Ating. Meta</th><th>Ating. Pos.</th></tr></thead>
        <tbody>{sellers.map(seller => <tr key={seller.code}>
          <td><b>{seller.code}</b></td>
          <td>{seller.name}</td>
          <td>{seller.target ? money.format(seller.target) : '—'}</td>
          <td>{industryTarget && seller.target ? percent.format(seller.target / industryTarget) : '—'}</td>
          <td>{money.format(seller.sellOut)}</td>
          <td>{integer.format(seller.positives)}</td>
          <td>{seller.target ? percent.format(seller.sellOut / seller.target) : '—'}</td>
          <td>{seller.positiveTarget ? percent.format(seller.positives / seller.positiveTarget) : '—'}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state compact-empty">Carregue Bússola, NOVOS RCAS e 8022.</div>}
    </section>
  </div>
}

function NetworksPage({ state, persist }: { state: StoredState; persist: (pool: number, targets: Record<string, NetworkTarget>) => void }) {
  const rows = useMemo(() => networkRowsFromStoredState(state), [state])
  const [pool, setPool] = useState(Number(state.networkPoolTarget) || 0)
  const [targets, setTargets] = useState<Record<string, NetworkTarget>>(() => ({ ...(state.networkTargets ?? {}) }))

  useEffect(() => {
    setPool(Number(state.networkPoolTarget) || 0)
    setTargets({ ...(state.networkTargets ?? {}) })
  }, [state.networkPoolTarget, state.networkTargets])

  const rowsWithDraft = rows.map(row => ({ ...row, target: Number(targets[row.name]?.target) || 0, locked: Boolean(targets[row.name]?.locked) }))
  const sellOutTotal = rows.reduce((sum, row) => sum + row.sellOut, 0)
  const billedTotal = rows.reduce((sum, row) => sum + row.billed, 0)
  const toInvoiceTotal = rows.reduce((sum, row) => sum + row.toInvoice, 0)

  function redistributePool(nextPool: number) {
    const lockedTotal = rowsWithDraft.filter(row => row.locked).reduce((sum, row) => sum + row.target, 0)
    const safePool = Math.max(nextPool, lockedTotal)
    const unlocked = rowsWithDraft.filter(row => !row.locked)
    const available = Math.max(0, safePool - lockedTotal)
    const currentTotal = unlocked.reduce((sum, row) => sum + row.target, 0)
    const currentSales = unlocked.reduce((sum, row) => sum + row.sellOut, 0)
    const next = { ...targets }
    unlocked.forEach(row => {
      const weight = currentTotal > 0 ? row.target / currentTotal : currentSales > 0 ? row.sellOut / currentSales : 1 / Math.max(1, unlocked.length)
      next[row.name] = { target: available * weight, locked: false }
    })
    rowsWithDraft.filter(row => row.locked).forEach(row => { next[row.name] = { target: row.target, locked: true } })
    setPool(safePool)
    setTargets(next)
  }

  function redistributeTarget(name: string, requested: number) {
    const currentRow = rowsWithDraft.find(row => row.name === name)
    if (!currentRow || pool <= 0) return
    const lockedOthers = rowsWithDraft.filter(row => row.name !== name && row.locked)
    const lockedTotal = lockedOthers.reduce((sum, row) => sum + row.target, 0)
    const value = Math.max(0, Math.min(requested, pool - lockedTotal))
    const candidates = rowsWithDraft.filter(row => row.name !== name && !row.locked)
    const remaining = Math.max(0, pool - lockedTotal - value)
    const candidateTotal = candidates.reduce((sum, row) => sum + row.target, 0)
    const candidateSales = candidates.reduce((sum, row) => sum + row.sellOut, 0)
    const next = { ...targets, [name]: { target: value, locked: currentRow.locked } }
    candidates.forEach(row => {
      const weight = candidateTotal > 0 ? row.target / candidateTotal : candidateSales > 0 ? row.sellOut / candidateSales : 1 / Math.max(1, candidates.length)
      next[row.name] = { target: remaining * weight, locked: false }
    })
    lockedOthers.forEach(row => { next[row.name] = { target: row.target, locked: true } })
    setTargets(next)
  }

  function toggleLock(name: string) {
    const current = rowsWithDraft.find(row => row.name === name)
    if (!current) return
    setTargets(previous => ({ ...previous, [name]: { target: current.target, locked: !current.locked } }))
  }

  return <div className="safe-networks-page">
    <section className="metrics enhanced-metrics four safe-network-kpis">
      <article className="metric red"><span>SELL OUT REDES</span><strong>{money.format(sellOutTotal)}</strong></article>
      <article className="metric"><span>FATURADO REDES</span><strong>{money.format(billedTotal)}</strong></article>
      <article className="metric"><span>A FATURAR REDES</span><strong>{money.format(toInvoiceTotal)}</strong></article>
      <article className="metric navy"><span>META TOTAL REDES</span><strong>{pool ? money.format(pool) : '—'}</strong></article>
    </section>

    <section className="panel section-block safe-network-target-panel">
      <div className="section-bar safe-network-heading"><div><span>REDES</span><h2>Faturamento, Sell Out e metas</h2></div><button className="safe-save-network" onClick={() => persist(pool, targets)}>Salvar metas</button></div>
      <div className="safe-network-pool"><span>META TOTAL DAS REDES</span><CurrencyEditor value={pool} onChange={redistributePool} /><small>A alteração redistribui proporcionalmente as redes não travadas.</small></div>
      <div className="table-scroll"><table className="safe-network-table"><thead><tr><th>Rede</th><th>CNPJs</th><th>Faturado</th><th>A faturar</th><th>Sell Out</th><th>Part.</th><th>Meta</th><th>Gap</th><th>Ating.</th><th>2025</th><th>Estado</th></tr></thead><tbody>{rowsWithDraft.map(row => {
        const achievement = row.target > 0 ? row.sellOut / row.target : 0
        return <tr key={row.name}>
          <td><b>{row.name}</b></td>
          <td>{row.customers}</td>
          <td>{money.format(row.billed)}</td>
          <td>{money.format(row.toInvoice)}</td>
          <td><b>{money.format(row.sellOut)}</b></td>
          <td>{sellOutTotal ? percent.format(row.sellOut / sellOutTotal) : '—'}</td>
          <td className="safe-network-target-cell"><CurrencyEditor value={row.target} onChange={value => redistributeTarget(row.name, value)} /></td>
          <td>{row.target ? money.format(row.sellOut - row.target) : '—'}</td>
          <td>{row.target ? percent.format(achievement) : '—'}</td>
          <td>{row.previous ? money.format(row.previous) : '—'}</td>
          <td><button className={row.locked ? 'lock-button locked' : 'lock-button'} onClick={() => toggleLock(row.name)}>{row.locked ? 'Travada' : 'Travar'}</button></td>
        </tr>
      })}</tbody></table></div>
      {!rows.some(row => row.customers > 0) && <div className="inline-alert">As redes estão configuradas, mas os CNPJs da venda ainda não estão casando com a Base de Premissas. Os valores não foram inventados: permanecem zerados até o vínculo ser reconhecido.</div>}
    </section>
  </div>
}

function SidebarButton({ type, active, onClick }: { type: 'stock' | 'config'; active: boolean; onClick: () => void }) {
  const config = type === 'stock'
    ? { number: '02', title: 'ESTOQUE', sub: 'Posição & abastecimento' }
    : { number: '03', title: 'CONFIGURAÇÕES', sub: 'Metas, bases & conferência' }
  return <button className={`module-item safe-side-module safe-${type}-module ${active ? 'active' : ''}`} onClick={onClick} title={config.title}>
    <span className="module-number">{config.number}</span>
    <span className="module-icon" aria-hidden="true">
      {type === 'stock' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path d="M4.5 7.8 12 12l7.5-4.2" /><path d="M12 12v9" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6Z" /></svg>}
    </span>
    <span className="module-label"><b>{config.title}</b><small>{config.sub}</small></span>
  </button>
}

function NetworksVirtualTab({ active }: { active: boolean }) {
  return <button className={`safe-virtual-tab safe-networks-tab ${active ? 'active' : ''}`} onClick={() => findTab('equipe')?.click()}>Redes</button>
}

export default function SafeLayoutRedistribution() {
  const [page, setPage] = useState(() => readActivePage())
  const [state, setState] = useState<StoredState>(() => readStoredState())
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)
  const [tabsTarget, setTabsTarget] = useState<HTMLElement | null>(null)

  const module = moduleForPage(page)

  useEffect(() => {
    document.documentElement.dataset.dashboardPage = page
    document.documentElement.dataset.dashboardModule = module
    return () => {
      delete document.documentElement.dataset.dashboardPage
      delete document.documentElement.dataset.dashboardModule
    }
  }, [page, module])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.tabs button:not(.safe-virtual-tab)')
      if (!button) return
      const next = pageFromLabel(button.textContent ?? '')
      if (next) setPage(next)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    let restored = false
    const refresh = () => {
      const nextMain = document.querySelector<HTMLElement>('main.v3-main')
      const nextNav = document.querySelector<HTMLElement>('.module-nav')
      const nextTabs = document.querySelector<HTMLElement>('.tabs')
      setMainTarget(current => current === nextMain ? current : nextMain)
      setNavTarget(current => current === nextNav ? current : nextNav)
      setTabsTarget(current => current === nextTabs ? current : nextTabs)

      if (!restored) {
        const requested = sessionStorage.getItem(RETURN_PAGE_KEY)
        if (requested && findTab(requested)) {
          restored = true
          sessionStorage.removeItem(RETURN_PAGE_KEY)
          findTab(requested)?.click()
        }
      }

      const actualPage = readActivePage()
      setPage(current => current === actualPage ? current : actualPage)

      const raw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (raw !== lastRaw) {
        lastRaw = raw
        setState(readStoredState())
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 700)
    return () => window.clearInterval(timer)
  }, [])

  function persistNetworkConfig(pool: number, targets: Record<string, NetworkTarget>) {
    const current = readStoredState()
    const next = { ...current, networkPoolTarget: pool, networkTargets: targets }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    sessionStorage.setItem(RETURN_PAGE_KEY, 'equipe')
    window.location.reload()
  }

  return <>
    {navTarget && createPortal(<>
      <SidebarButton type="stock" active={module === 'stock'} onClick={() => findTab('estoque')?.click()} />
      <SidebarButton type="config" active={module === 'config'} onClick={() => findTab('metas')?.click()} />
    </>, navTarget)}
    {tabsTarget && createPortal(<NetworksVirtualTab active={page === 'equipe'} />, tabsTarget)}

    {mainTarget && page === 'resumo' && createPortal(<>
      <ProductLineSummary state={state} />
      <StockSummary state={state} />
    </>, mainTarget)}
    {mainTarget && page === 'gerencial' && createPortal(<TeamGerencial state={state} />, mainTarget)}
    {mainTarget && page === 'equipe' && createPortal(<NetworksPage state={state} persist={persistNetworkConfig} />, mainTarget)}
  </>
}
