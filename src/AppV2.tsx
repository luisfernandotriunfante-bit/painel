import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import {
  CatalogFinance,
  CustomerSales,
  mergeSellers,
  parseBussola,
  parseCatalog,
  parsePremises,
  parseRcas,
  parseStock,
  RcaEntry,
  SellerSales,
  SellerTarget,
  StockItem,
  UploadInfo,
  UploadKey,
} from './data'
import {
  DailyMovement,
  parseHistoryEnhanced,
  parsePosition105Enhanced,
  parseSalesEnhanced,
  PositionItem,
} from './enhancedData'
import { parseTransitPortfolio } from './transit'

type Page = 'resumo' | 'gerencial' | 'equipe' | 'estoque' | 'metas' | 'conferencia' | 'upload'
type NetworkTarget = { target: number; locked: boolean }
type NetworkRow = {
  name: string
  sellOut: number
  previous: number
  target: number
  locked: boolean
  customers: number
}

type AppState = {
  periodYear: number
  periodMonth: number
  periodLabel: string
  sellOut: number
  billed: number
  toInvoice: number
  potentialPositives: number
  daily: number[]
  dailyMovement: DailyMovement[]
  salesSellerActuals: SellerSales[]
  sellerTargets: SellerTarget[]
  salesCustomers: CustomerSales[]
  rcaByOldCode: Record<string, RcaEntry>
  networkByCnpj: Record<string, string>
  historyByMonth: Record<string, Record<string, number>>
  historyMonthCounts: Record<string, number>
  industryTarget: number
  industryPositiveTarget: number
  sellOutTarget: number
  networkPoolTarget: number
  networkTargets: Record<string, NetworkTarget>
  stockTransit: number
  stockUnits: number
  stockBoxes: number
  stockItems: StockItem[]
  positionCost: number
  positionSale: number
  positionUnits: number
  positionRows: number
  positionItems: PositionItem[]
  positionFinanceByCode: Record<string, CatalogFinance>
  catalogFinanceByCode: Record<string, CatalogFinance>
  uploads: Record<UploadKey, UploadInfo>
  warnings: string[]
}

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const STRATEGIC_NETWORKS = ['ABV', 'MEGA', 'PIRES', 'NOVA ESTRELA', 'PORTAL / PRINCESA'] as const
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const now = new Date()

const emptyUploads: Record<UploadKey, UploadInfo> = {
  sales: null,
  stock: null,
  targets: null,
  rcas: null,
  position: null,
  catalog: null,
  premises: null,
  history: null,
  transit: null,
}

const initialState: AppState = {
  periodYear: now.getFullYear(),
  periodMonth: now.getMonth() + 1,
  periodLabel: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  sellOut: 0,
  billed: 0,
  toInvoice: 0,
  potentialPositives: 0,
  daily: [],
  dailyMovement: [],
  salesSellerActuals: [],
  sellerTargets: [],
  salesCustomers: [],
  rcaByOldCode: {},
  networkByCnpj: {},
  historyByMonth: {},
  historyMonthCounts: {},
  industryTarget: 0,
  industryPositiveTarget: 0,
  sellOutTarget: 0,
  networkPoolTarget: 0,
  networkTargets: {},
  stockTransit: 0,
  stockUnits: 0,
  stockBoxes: 0,
  stockItems: [],
  positionCost: 0,
  positionSale: 0,
  positionUnits: 0,
  positionRows: 0,
  positionItems: [],
  positionFinanceByCode: {},
  catalogFinanceByCode: {},
  uploads: emptyUploads,
  warnings: [],
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const old = JSON.parse(raw)
    const seededTargets: Record<string, NetworkTarget> = old.networkTargets ?? {}
    if (!Object.keys(seededTargets).length && Array.isArray(old.networks)) {
      for (const network of old.networks) {
        if (network?.name) seededTargets[network.name] = { target: Number(network.target) || 0, locked: false }
      }
    }
    const dailyMovement: DailyMovement[] = Array.isArray(old.dailyMovement) && old.dailyMovement.length
      ? old.dailyMovement
      : (Array.isArray(old.daily) ? old.daily.map((value: number, index: number) => ({ day: index + 1, billed: 0, toInvoice: 0, sellOut: Number(value) || 0, positives: 0 })) : [])
    return {
      ...initialState,
      ...old,
      dailyMovement,
      positionItems: Array.isArray(old.positionItems) ? old.positionItems : [],
      historyMonthCounts: old.historyMonthCounts ?? {},
      networkTargets: seededTargets,
      uploads: { ...emptyUploads, ...(old.uploads ?? {}) },
    }
  } catch {
    return initialState
  }
}

function parseCurrency(raw: string) {
  const cleaned = raw.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : 0
}

function CurrencyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  return <input className="currency-input" value={editing ? draft : money.format(value)} onFocus={() => { setEditing(true); setDraft(value.toFixed(2).replace('.', ',')) }} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onChange(parseCurrency(draft)); setEditing(false) }} />
}

function Metric({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</article>
}

function fileInfo(file: File, rows?: number, detail?: string): UploadInfo {
  return { name: file.name, size: file.size, updatedAt: new Date().toISOString(), rows, detail }
}

function previousMonthKey(state: AppState) {
  return `${state.periodYear - 1}-${String(state.periodMonth).padStart(2, '0')}`
}

function warningMerge(current: string[], source: string, warnings: string[]) {
  const cleaned = current.filter(item => !item.startsWith(`${source}:`))
  return [...cleaned, ...warnings.map(item => `${source}: ${item}`)]
}

function networkRowsFromState(state: AppState): NetworkRow[] {
  const current = new Map<string, { value: number; customers: Set<string> }>()
  STRATEGIC_NETWORKS.forEach(name => current.set(name, { value: 0, customers: new Set<string>() }))
  for (const customer of state.salesCustomers) {
    const network = state.networkByCnpj[customer.cnpj]
    const bucket = current.get(network)
    if (!bucket) continue
    bucket.value += customer.value
    bucket.customers.add(customer.cnpj)
  }
  const previousByCnpj = state.historyByMonth[previousMonthKey(state)] ?? {}
  const previous = new Map<string, number>()
  STRATEGIC_NETWORKS.forEach(name => previous.set(name, 0))
  for (const [cnpj, value] of Object.entries(previousByCnpj)) {
    const network = state.networkByCnpj[cnpj]
    if (!previous.has(network)) continue
    previous.set(network, (previous.get(network) ?? 0) + value)
  }
  return STRATEGIC_NETWORKS.map(name => ({
    name,
    sellOut: current.get(name)?.value ?? 0,
    previous: previous.get(name) ?? 0,
    target: state.networkTargets[name]?.target ?? 0,
    locked: state.networkTargets[name]?.locked ?? false,
    customers: current.get(name)?.customers.size ?? 0,
  }))
}

function seedNetworkTargets(state: AppState): AppState {
  if (state.networkPoolTarget <= 0) return state
  if (STRATEGIC_NETWORKS.some(name => (state.networkTargets[name]?.target ?? 0) > 0)) return state
  const rows = networkRowsFromState(state)
  const totalSellOut = rows.reduce((sum, row) => sum + row.sellOut, 0)
  const networkTargets = { ...state.networkTargets }
  rows.forEach(row => {
    networkTargets[row.name] = {
      target: totalSellOut > 0 ? state.networkPoolTarget * row.sellOut / totalSellOut : state.networkPoolTarget / rows.length,
      locked: false,
    }
  })
  return { ...state, networkTargets }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty-state compact-empty">{children}</div>
}

function AppV2() {
  const [page, setPage] = useState<Page>('resumo')
  const [state, setState] = useState<AppState>(loadState)
  const [processing, setProcessing] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
    catch { setError('O armazenamento local deste navegador atingiu o limite. Limpe bases antigas ou recarregue os arquivos.') }
  }, [state])

  const sellers = useMemo(() => mergeSellers(state.sellerTargets, state.salesSellerActuals, state.rcaByOldCode), [state.sellerTargets, state.salesSellerActuals, state.rcaByOldCode])
  const networks = useMemo(() => networkRowsFromState(state), [state])

  async function processUpload(key: UploadKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setProcessing(`Processando ${file.name}...`)
    setError('')
    try {
      if (key === 'sales') {
        const result = await parseSalesEnhanced(file)
        setState(current => seedNetworkTargets({
          ...current,
          periodYear: result.periodYear,
          periodMonth: result.periodMonth,
          periodLabel: result.periodLabel,
          sellOut: result.sellOut,
          billed: result.billed,
          toInvoice: result.toInvoice,
          potentialPositives: result.potentialPositives,
          daily: result.daily,
          dailyMovement: result.dailyMovement,
          salesSellerActuals: result.sellers,
          salesCustomers: result.customers,
          uploads: { ...current.uploads, sales: fileInfo(file, result.rows, `${money.format(result.sellOut)} no período`) },
          warnings: warningMerge(current.warnings, '8022', result.warnings),
        }))
      } else if (key === 'targets') {
        const result = await parseBussola(file)
        setState(current => ({ ...current, sellerTargets: result.sellers, industryTarget: result.industryTarget, industryPositiveTarget: result.industryPositiveTarget, uploads: { ...current.uploads, targets: fileInfo(file, result.rows, `${result.sellers.length} linhas Colgate`) }, warnings: warningMerge(current.warnings, 'Bússola', result.warnings) }))
      } else if (key === 'rcas') {
        const result = await parseRcas(file)
        setState(current => ({ ...current, rcaByOldCode: result.byOldCode, uploads: { ...current.uploads, rcas: fileInfo(file, result.rows, `${result.rows} RCAs atuais`) }, warnings: warningMerge(current.warnings, 'RCAs', result.warnings) }))
      } else if (key === 'premises') {
        const result = await parsePremises(file)
        setState(current => seedNetworkTargets({ ...current, networkByCnpj: result.networkByCnpj, uploads: { ...current.uploads, premises: fileInfo(file, result.rows, `${result.networks} redes mapeadas`) }, warnings: warningMerge(current.warnings, 'Premissas', result.warnings) }))
      } else if (key === 'stock') {
        const result = await parseStock(file)
        setState(current => ({ ...current, stockItems: result.items, stockUnits: result.totalUnits, stockBoxes: result.totalBoxes, uploads: { ...current.uploads, stock: fileInfo(file, result.rows, `${integer.format(result.totalUnits)} unidades disponíveis`) }, warnings: warningMerge(current.warnings, '8013', result.warnings) }))
      } else if (key === 'position') {
        const result = await parsePosition105Enhanced(file)
        setState(current => ({ ...current, positionItems: result.items, positionFinanceByCode: result.financeByCode, positionCost: result.totalCost, positionSale: result.totalSale, positionUnits: result.totalUnits, positionRows: result.rows, uploads: { ...current.uploads, position: fileInfo(file, result.rows, `${money.format(result.totalCost)} custo • ${money.format(result.totalSale)} venda`) }, warnings: warningMerge(current.warnings, '105', result.warnings) }))
      } else if (key === 'catalog') {
        const result = await parseCatalog(file)
        setState(current => ({ ...current, catalogFinanceByCode: result.financeByCode, uploads: { ...current.uploads, catalog: fileInfo(file, result.rows, 'cadastro auxiliar processado') }, warnings: warningMerge(current.warnings, '286', result.warnings) }))
      } else if (key === 'history') {
        const result = await parseHistoryEnhanced(file)
        const month = `${state.periodYear - 1}-${String(state.periodMonth).padStart(2, '0')}`
        const monthRows = Object.keys(result.byMonth[month] ?? {}).length
        setState(current => ({ ...current, historyByMonth: result.byMonth, historyMonthCounts: result.monthCounts, uploads: { ...current.uploads, history: fileInfo(file, result.rows, `${monthRows} CNPJs no mês comparável`) }, warnings: warningMerge(current.warnings, '379', result.warnings) }))
      } else if (key === 'transit') {
        const result = await parseTransitPortfolio(file)
        setState(current => ({ ...current, stockTransit: result.totalValue, uploads: { ...current.uploads, transit: fileInfo(file, result.rows, `${money.format(result.totalValue)} em trânsito`) }, warnings: warningMerge(current.warnings, 'Carteira', result.warnings) }))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao processar o arquivo.')
    } finally {
      setProcessing('')
      event.target.value = ''
    }
  }

  function setNetworkPool(value: number) {
    setState(current => {
      const rows = networkRowsFromState(current)
      const lockedTotal = rows.filter(row => row.locked).reduce((sum, row) => sum + row.target, 0)
      const pool = Math.max(value, lockedTotal)
      const unlocked = rows.filter(row => !row.locked)
      const available = Math.max(0, pool - lockedTotal)
      const currentTotal = unlocked.reduce((sum, row) => sum + row.target, 0)
      const sellOutTotal = unlocked.reduce((sum, row) => sum + row.sellOut, 0)
      const networkTargets = { ...current.networkTargets }
      unlocked.forEach(row => {
        const weight = currentTotal > 0 ? row.target / currentTotal : sellOutTotal > 0 ? row.sellOut / sellOutTotal : 1 / Math.max(1, unlocked.length)
        networkTargets[row.name] = { target: available * weight, locked: false }
      })
      rows.filter(row => row.locked).forEach(row => { networkTargets[row.name] = { target: row.target, locked: true } })
      return { ...current, networkPoolTarget: pool, networkTargets }
    })
  }

  function setNetworkTarget(name: string, requested: number) {
    setState(current => {
      const rows = networkRowsFromState(current)
      const currentRow = rows.find(row => row.name === name)
      if (!currentRow || current.networkPoolTarget <= 0) return current
      const lockedOthers = rows.filter(row => row.name !== name && row.locked)
      const lockedTotal = lockedOthers.reduce((sum, row) => sum + row.target, 0)
      const value = Math.max(0, Math.min(requested, current.networkPoolTarget - lockedTotal))
      const candidates = rows.filter(row => row.name !== name && !row.locked)
      const remaining = Math.max(0, current.networkPoolTarget - lockedTotal - value)
      const candidateTotal = candidates.reduce((sum, row) => sum + row.target, 0)
      const candidateSellOut = candidates.reduce((sum, row) => sum + row.sellOut, 0)
      const networkTargets = { ...current.networkTargets, [name]: { target: value, locked: currentRow.locked } }
      candidates.forEach(row => {
        const weight = candidateTotal > 0 ? row.target / candidateTotal : candidateSellOut > 0 ? row.sellOut / candidateSellOut : 1 / Math.max(1, candidates.length)
        networkTargets[row.name] = { target: remaining * weight, locked: false }
      })
      lockedOthers.forEach(row => { networkTargets[row.name] = { target: row.target, locked: true } })
      return { ...current, networkTargets }
    })
  }

  function toggleNetworkLock(name: string) {
    setState(current => {
      const row = networkRowsFromState(current).find(item => item.name === name)
      if (!row) return current
      return { ...current, networkTargets: { ...current.networkTargets, [name]: { target: row.target, locked: !row.locked } } }
    })
  }

  function resetLocal() {
    if (!window.confirm('Apagar a base processada e as configurações deste navegador?')) return
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState)
  }

  const tabs: [Page, string][] = [['resumo', 'Resumo'], ['gerencial', 'Gerencial'], ['equipe', 'Equipe'], ['estoque', 'Estoque'], ['metas', 'Metas'], ['conferencia', 'Conferência'], ['upload', 'Upload de dados']]

  return <div className="app enhanced-app">
    <header className="header"><div><span>MILÊNIO • INTELIGÊNCIA COMERCIAL</span><h1>Painel Sell Out</h1></div><div className="header-status"><b><i className={state.uploads.sales ? '' : 'off'} /> {state.uploads.sales ? 'Base Real Local Ativa' : 'Aguardando 8022'}</b><strong>{state.periodLabel}</strong></div></header>
    <nav className="tabs">{tabs.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>)}</nav>
    {(processing || error) && <div className={`global-message ${error ? 'error' : ''}`}>{error || processing}</div>}
    <main className="compact-main">
      {page === 'resumo' && <Resumo state={state} />}
      {page === 'gerencial' && <Gerencial state={state} networks={networks} />}
      {page === 'equipe' && <Equipe state={state} sellers={sellers} />}
      {page === 'estoque' && <Estoque state={state} />}
      {page === 'metas' && <Metas state={state} networks={networks} sellers={sellers} setState={setState} setNetworkPool={setNetworkPool} setNetworkTarget={setNetworkTarget} toggleNetworkLock={toggleNetworkLock} />}
      {page === 'conferencia' && <Conferencia state={state} />}
      {page === 'upload' && <Upload state={state} processUpload={processUpload} resetLocal={resetLocal} />}
    </main>
  </div>
}

function Resumo({ state }: { state: AppState }) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  const detailed = state.dailyMovement.some(item => item.billed !== 0 || item.toInvoice !== 0 || item.positives !== 0)
  const totalStock = state.positionRows > 0 ? state.positionCost : 0
  return <>
    <section className="metrics enhanced-metrics six">
      <Metric label="SELL OUT TOTAL" value={state.uploads.sales ? money.format(state.sellOut) : '—'} tone="red" />
      <Metric label="FATURADO" value={state.uploads.sales ? money.format(state.billed) : '—'} tone="navy" />
      <Metric label="A FATURAR" value={state.uploads.sales ? money.format(state.toInvoice) : '—'} />
      <Metric label="POSITIVAÇÃO" value={state.uploads.sales ? integer.format(state.potentialPositives) : '—'} />
      <Metric label="ESTOQUE AO CUSTO" value={state.positionRows ? money.format(totalStock) : '—'} />
      <Metric label="EM TRÂNSITO" value={state.uploads.transit ? money.format(state.stockTransit) : '—'} />
    </section>
    <section className="panel section-block movement-panel">
      <div className="section-bar"><div><span>MOVIMENTO DIÁRIO</span><h2>Faturado, a faturar e positivação</h2></div><div className="segmented"><button className={mode === 'chart' ? 'active' : ''} onClick={() => setMode('chart')}>Gráfico</button><button className={mode === 'table' ? 'active' : ''} onClick={() => setMode('table')}>Tabela</button></div></div>
      {!state.uploads.sales ? <Empty>Carregue o 8022.</Empty> : mode === 'chart' ? <MovementChart data={state.dailyMovement} periodYear={state.periodYear} periodMonth={state.periodMonth} detailed={detailed} /> : <MovementTable data={state.dailyMovement} />}
    </section>
  </>
}

function MovementChart({ data, periodYear, periodMonth, detailed }: { data: DailyMovement[]; periodYear: number; periodMonth: number; detailed: boolean }) {
  const currentMonth = periodYear === now.getFullYear() && periodMonth === now.getMonth() + 1
  const maxValue = Math.max(...data.map(item => Math.max(item.billed, item.toInvoice)), 1)
  return <div className="movement-wrap"><div className="chart-legend"><span><i className="legend-billed" /> Faturado</span><span><i className="legend-pending" /> A faturar</span><span><i className="legend-positive" /> Positivações</span></div>{!detailed && <div className="inline-alert">Recarregue o 8022 uma vez para separar faturado, a faturar e positivações por dia.</div>}<div className="multi-bars">{data.map(item => { const future = currentMonth && item.day > now.getDate(); return <div className={`day-group ${future ? 'future' : ''}`} key={item.day} title={`${item.day}: Faturado ${money.format(item.billed)} • A faturar ${money.format(item.toInvoice)} • Sell Out ${money.format(item.sellOut)} • ${item.positives} positivações`}><b className="positive-bubble">{item.positives || ''}</b><div className="dual-bars"><i className="billed" style={{ height: `${item.billed ? Math.max(3, item.billed / maxValue * 100) : 1}%` }} /><i className="pending" style={{ height: `${item.toInvoice ? Math.max(3, item.toInvoice / maxValue * 100) : 1}%` }} /></div><span>{item.day}</span></div> })}</div></div>
}

function MovementTable({ data }: { data: DailyMovement[] }) {
  return <div className="table-scroll movement-table"><table><thead><tr><th>Dia</th><th>Faturado</th><th>A faturar</th><th>Sell Out</th><th>Positivações</th></tr></thead><tbody>{data.map(item => <tr key={item.day}><td><b>{item.day}</b></td><td>{money.format(item.billed)}</td><td>{money.format(item.toInvoice)}</td><td><b>{money.format(item.sellOut)}</b></td><td>{integer.format(item.positives)}</td></tr>)}</tbody></table></div>
}

function Gerencial({ state, networks }: { state: AppState; networks: NetworkRow[] }) {
  const strategicSellOut = networks.reduce((sum, item) => sum + item.sellOut, 0)
  const strategicPrevious = networks.reduce((sum, item) => sum + item.previous, 0)
  const activeNetworks = networks.filter(item => item.sellOut !== 0).length
  const share = state.sellOut ? strategicSellOut / state.sellOut : 0
  const historyLoaded = Boolean(state.uploads.history)
  const historyMatches = networks.filter(item => item.previous !== 0).length
  return <>
    <section className="metrics enhanced-metrics five-equal">
      <Metric label="SELL OUT REDES" value={money.format(strategicSellOut)} tone="red" />
      <Metric label="PARTICIPAÇÃO NO TOTAL" value={state.sellOut ? percent.format(share) : '—'} />
      <Metric label="REDES COM MOVIMENTO" value={`${activeNetworks} / ${networks.length}`} />
      <Metric label="META TOTAL REDES" value={state.networkPoolTarget ? money.format(state.networkPoolTarget) : '—'} />
      <Metric label="MESMO MÊS 2025" value={historyMatches ? money.format(strategicPrevious) : '—'} tone="navy" />
    </section>
    <section className="panel section-block">
      <div className="section-bar"><div><span>REDES ESTRATÉGICAS</span><h2>Participação, meta, realizado e histórico</h2></div><div className={`status-pill ${historyMatches ? 'ok' : historyLoaded ? 'warn' : ''}`}>{historyMatches ? `${historyMatches} redes com histórico` : historyLoaded ? '379 carregado • sem casamento' : '379 não carregado'}</div></div>
      <div className="table-scroll"><table className="manager-table"><thead><tr><th>Rede</th><th>CNPJs</th><th>Sell Out</th><th>Participação</th><th>Meta</th><th>Gap</th><th>Ating.</th><th>2025</th><th>Var.</th></tr></thead><tbody>{networks.map(row => { const achievement = row.target > 0 ? row.sellOut / row.target : 0; const variation = row.previous !== 0 ? row.sellOut / row.previous - 1 : null; return <tr key={row.name}><td><b>{row.name}</b></td><td>{row.customers}</td><td>{money.format(row.sellOut)}</td><td>{strategicSellOut ? percent.format(row.sellOut / strategicSellOut) : '—'}</td><td>{row.target ? money.format(row.target) : '—'}{row.locked && <span className="mini-lock">travada</span>}</td><td>{row.target ? money.format(row.sellOut - row.target) : '—'}</td><td>{row.target ? percent.format(achievement) : '—'}</td><td>{row.previous ? money.format(row.previous) : '—'}</td><td className={variation == null ? '' : variation >= 0 ? 'positive' : 'negative'}>{variation == null ? '—' : `${variation >= 0 ? '+' : ''}${percent.format(variation)}`}</td></tr> })}</tbody></table></div>
      {historyLoaded && !historyMatches && <div className="inline-alert">O 379 foi processado, mas nenhum CNPJ do mês comparável casou com as redes estratégicas da Base de Premissas. Recarregue a Base de Premissas e o 379 para refazer o cruzamento.</div>}
    </section>
  </>
}

function Equipe({ state, sellers }: { state: AppState; sellers: ReturnType<typeof mergeSellers> }) {
  const total = sellers.reduce((sum, seller) => sum + seller.sellOut, 0)
  const positives = sellers.reduce((sum, seller) => sum + seller.positives, 0)
  return <>
    <section className="metrics enhanced-metrics four">
      <Metric label="SELL OUT IDENTIFICADO" value={state.uploads.sales ? money.format(total) : '—'} tone="red" />
      <Metric label="POSITIVAÇÕES POR RCA" value={state.uploads.sales ? integer.format(positives) : '—'} />
      <Metric label="RCAS COM MOVIMENTO" value={state.uploads.sales ? integer.format(sellers.filter(item => item.sellOut !== 0).length) : '—'} />
      <Metric label="RCAS MAPEADOS" value={state.uploads.rcas ? integer.format(Object.keys(state.rcaByOldCode).length) : '—'} tone="navy" />
    </section>
    <section className="panel section-block"><div className="section-bar"><div><span>EQUIPE</span><h2>Realizado por RCA atual</h2></div></div>{sellers.length ? <div className="table-scroll"><table><thead><tr><th>RCA</th><th>Vendedor</th><th>Sell Out</th><th>Participação</th><th>Positivação</th><th>Ating. Meta</th><th>Ating. Pos.</th></tr></thead><tbody>{sellers.map(seller => <tr key={seller.code}><td><b>{seller.code}</b></td><td>{seller.name}</td><td>{money.format(seller.sellOut)}</td><td>{total ? percent.format(seller.sellOut / total) : '—'}</td><td>{integer.format(seller.positives)}</td><td>{seller.target ? percent.format(seller.sellOut / seller.target) : '—'}</td><td>{seller.positiveTarget ? percent.format(seller.positives / seller.positiveTarget) : '—'}</td></tr>)}</tbody></table></div> : <Empty>Carregue Bússola, NOVOS RCAS e 8022.</Empty>}</section>
  </>
}

function Estoque({ state }: { state: AppState }) {
  const [line, setLine] = useState('Todas')
  const [search, setSearch] = useState('')
  const lines = useMemo(() => {
    const map = new Map<string, { name: string; units: number; cost: number; sale: number; items: number }>()
    for (const item of state.positionItems) {
      const row = map.get(item.line) ?? { name: item.line, units: 0, cost: 0, sale: 0, items: 0 }
      row.units += item.units
      row.cost += item.costValue
      row.sale += item.saleValue
      row.items += 1
      map.set(item.line, row)
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost)
  }, [state.positionItems])
  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase()
    return state.positionItems.filter(item => (line === 'Todas' || item.line === line) && (!term || item.code.includes(term) || item.description.toUpperCase().includes(term)))
  }, [state.positionItems, line, search])
  return <>
    <section className="metrics enhanced-metrics four">
      <Metric label="ESTOQUE ATUAL AO CUSTO" value={state.positionRows ? money.format(state.positionCost) : '—'} tone="red" />
      <Metric label="ABASTECIMENTO EM TRÂNSITO" value={state.uploads.transit ? money.format(state.stockTransit) : '—'} tone="navy" />
      <Metric label="POSIÇÃO AO CUSTO + TRÂNSITO" value={state.positionRows ? money.format(state.positionCost + state.stockTransit) : '—'} />
      <Metric label="ESTOQUE A PREÇO DE VENDA" value={state.positionRows ? money.format(state.positionSale) : '—'} />
    </section>
    <section className="line-grid">{lines.map(item => <button key={item.name} className={line === item.name ? 'line-card active' : 'line-card'} onClick={() => setLine(current => current === item.name ? 'Todas' : item.name)}><span>{item.name}</span><strong>{money.format(item.cost)}</strong><small>{integer.format(item.units)} un. • {item.items} SKUs</small></button>)}</section>
    <section className="panel section-block stock-detail"><div className="section-bar stock-toolbar"><div><span>ESTOQUE POR SKU</span><h2>{line === 'Todas' ? 'Todos os produtos' : line}</h2></div><div className="stock-filters"><select value={line} onChange={event => setLine(event.target.value)}><option>Todas</option>{lines.map(item => <option key={item.name}>{item.name}</option>)}</select><input placeholder="Buscar código ou produto" value={search} onChange={event => setSearch(event.target.value)} /></div></div>{state.positionItems.length ? <div className="table-scroll"><table><thead><tr><th>Código</th><th>Produto</th><th>Linha</th><th>Qt.Est.</th><th>Real unit.</th><th>Estoque custo</th><th>P. Venda</th><th>Estoque venda</th></tr></thead><tbody>{filtered.map((item, index) => <tr key={`${item.code}-${index}`}><td><b>{item.code || '—'}</b></td><td className="product-cell">{item.description}</td><td>{item.line}</td><td>{integer.format(item.units)}</td><td>{money.format(item.costUnit)}</td><td><b>{money.format(item.costValue)}</b></td><td>{money.format(item.saleUnit)}</td><td>{money.format(item.saleValue)}</td></tr>)}</tbody></table></div> : <Empty>Recarregue o 105 com “Considerado: Físico” uma vez para habilitar o detalhamento por produto.</Empty>}</section>
  </>
}

function Metas({ state, networks, sellers, setState, setNetworkPool, setNetworkTarget, toggleNetworkLock }: { state: AppState; networks: NetworkRow[]; sellers: ReturnType<typeof mergeSellers>; setState: React.Dispatch<React.SetStateAction<AppState>>; setNetworkPool: (value: number) => void; setNetworkTarget: (name: string, value: number) => void; toggleNetworkLock: (name: string) => void }) {
  const networkSum = networks.reduce((sum, row) => sum + row.target, 0)
  return <>
    <section className="target-control-grid">
      <article className="target-control primary"><span>META SELL OUT • T&C</span><CurrencyInput value={state.sellOutTarget} onChange={value => setState(current => ({ ...current, sellOutTarget: value }))} /><small>{state.sellOutTarget ? `${percent.format(state.sellOut / state.sellOutTarget)} atingido` : 'Definição manual'}</small></article>
      <article className="target-control"><span>META TOTAL DAS REDES</span><CurrencyInput value={state.networkPoolTarget} onChange={setNetworkPool} /><small>Soma atual: {money.format(networkSum)}</small></article>
      <article className="target-control readonly"><span>META INDÚSTRIA • BÚSSOLA</span><strong>{state.uploads.targets ? money.format(state.industryTarget) : '—'}</strong><small>Importada</small></article>
      <article className="target-control readonly"><span>META POSITIVAÇÃO • BÚSSOLA</span><strong>{state.uploads.targets ? integer.format(state.industryPositiveTarget) : '—'}</strong><small>Importada</small></article>
    </section>
    <section className="panel section-block"><div className="section-bar"><div><span>METAS DAS REDES</span><h2>Distribuição e travas</h2></div><div className="status-pill">{networks.filter(row => row.locked).length} travadas</div></div><div className="table-scroll"><table className="targets-table"><thead><tr><th>Rede</th><th>Participação atual</th><th>Sell Out</th><th>Meta</th><th>Estado</th></tr></thead><tbody>{networks.map(row => <tr key={row.name}><td><b>{row.name}</b></td><td>{state.sellOut ? percent.format(row.sellOut / Math.max(1, networks.reduce((sum, item) => sum + item.sellOut, 0))) : '—'}</td><td>{money.format(row.sellOut)}</td><td className="target-input-cell"><CurrencyInput value={row.target} onChange={value => setNetworkTarget(row.name, value)} /></td><td><button className={row.locked ? 'lock-button locked' : 'lock-button'} onClick={() => toggleNetworkLock(row.name)}>{row.locked ? 'Travada' : 'Travar'}</button></td></tr>)}</tbody></table></div></section>
    <section className="panel section-block"><div className="section-bar"><div><span>METAS DA EQUIPE</span><h2>Bússola Colgate</h2></div></div>{sellers.length ? <div className="table-scroll"><table><thead><tr><th>RCA</th><th>Vendedor</th><th>Meta Sell Out</th><th>Meta Positivação</th></tr></thead><tbody>{sellers.map(seller => <tr key={seller.code}><td><b>{seller.code}</b></td><td>{seller.name}</td><td>{seller.target ? money.format(seller.target) : '—'}</td><td>{seller.positiveTarget ? integer.format(seller.positiveTarget) : '—'}</td></tr>)}</tbody></table></div> : <Empty>Carregue a Bússola e NOVOS RCAS.</Empty>}</section>
  </>
}

function Conferencia({ state }: { state: AppState }) {
  return <section className="conference-grid"><article className="panel section-block"><div className="section-bar"><div><span>FONTES</span><h2>Base local</h2></div></div><div className="source-list">{(Object.keys(state.uploads) as UploadKey[]).map(key => <div key={key}><span>{sourceLabel(key)}</span><strong>{state.uploads[key]?.name ?? 'Não carregado'}</strong><small>{state.uploads[key]?.detail ?? ''}</small></div>)}</div></article><article className="panel section-block"><div className="section-bar"><div><span>CONFERÊNCIA</span><h2>Pendências</h2></div></div>{state.warnings.length ? <ul className="warning-list">{state.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul> : <Empty>Sem pendências registradas.</Empty>}</article></section>
}

function Upload({ state, processUpload, resetLocal }: { state: AppState; processUpload: (key: UploadKey, event: ChangeEvent<HTMLInputElement>) => Promise<void>; resetLocal: () => void }) {
  const cards: { key: UploadKey; title: string; accept: string }[] = [
    { key: 'sales', title: 'VENDAS • 8022', accept: '.xls,.xlsx' },
    { key: 'targets', title: 'METAS • BÚSSOLA', accept: '.xls,.xlsx' },
    { key: 'rcas', title: 'EQUIPE • NOVOS RCAS', accept: '.xls,.xlsx' },
    { key: 'premises', title: 'BASE DE PREMISSAS • Q3', accept: '.xls,.xlsx' },
    { key: 'position', title: 'ESTOQUE FÍSICO • 105', accept: '.xls,.xlsx' },
    { key: 'stock', title: 'ESTOQUE DISPONÍVEL • 8013', accept: '.xls,.xlsx' },
    { key: 'catalog', title: 'CADASTRO • 286', accept: '.xls,.xlsx' },
    { key: 'history', title: 'HISTÓRICO • 379 2025', accept: '.txt' },
    { key: 'transit', title: 'CARTEIRA COLGATE • EM TRÂNSITO', accept: '.xls,.xlsx,.csv,.txt' },
  ]
  return <><section className="upload-grid compact-upload">{cards.map(card => <label className="upload-card" key={card.key}><div><span>{card.title}</span></div><input type="file" accept={card.accept} onChange={event => void processUpload(card.key, event)} /><strong>{state.uploads[card.key]?.name ?? 'Selecionar arquivo'}</strong><small>{state.uploads[card.key]?.detail ?? 'Não carregado'}</small></label>)}</section><section className="storage compact-storage"><div><span>PERSISTÊNCIA LOCAL</span><h3>Base preservada após F5</h3></div><button onClick={resetLocal}>Limpar base local</button></section></>
}

function sourceLabel(key: UploadKey) {
  return ({ sales: '8022 • Vendas', targets: 'Bússola • Metas', rcas: 'Novos RCAs', premises: 'Premissas Q3', position: '105 • Estoque físico', stock: '8013 • Disponível', catalog: '286 • Cadastro', history: '379 • Histórico', transit: 'Carteira Colgate' })[key]
}

export default AppV2
