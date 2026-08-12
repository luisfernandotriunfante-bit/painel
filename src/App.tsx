import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import {
  buildNetworks,
  CatalogFinance,
  CustomerSales,
  HistoryResult,
  mergeSellers,
  parseBussola,
  parseCatalog,
  parseHistory379,
  parsePosition105,
  parsePremises,
  parseRcas,
  parseSales,
  parseStock,
  RcaEntry,
  SellerSales,
  SellerTarget,
  StockItem,
  stockFinancial,
  UploadInfo,
  UploadKey,
} from './data'

type Page = 'resumo' | 'gerencial' | 'equipe' | 'estoque' | 'conferencia' | 'upload'
type Network = { name: string; target: number; sellOut: number; previous: number }
type Seller = { code: string; name: string; target: number; sellOut: number; positives: number; positiveTarget: number }
type StockLine = { name: string; cost: number; sale: number; units: number; boxes: number; matched: number; total: number; rule: string }

type AppState = {
  periodYear: number
  periodMonth: number
  periodLabel: string
  sellOut: number
  billed: number
  toInvoice: number
  potentialPositives: number
  stockCost: number
  stockSale: number
  stockTransit: number
  stockUnits: number
  stockBoxes: number
  stockMatched: number
  sellOutTarget: number
  networkPoolTarget: number
  industryTarget: number
  industryPositiveTarget: number
  networks: Network[]
  sellers: Seller[]
  stockLines: StockLine[]
  daily: number[]
  salesSellerActuals: SellerSales[]
  sellerTargets: SellerTarget[]
  salesCustomers: CustomerSales[]
  rcaByOldCode: Record<string, RcaEntry>
  networkByCnpj: Record<string, string>
  historyByMonth: HistoryResult['byMonth']
  stockItems: StockItem[]
  catalogFinanceByCode: Record<string, CatalogFinance>
  positionFinanceByCode: Record<string, CatalogFinance>
  uploads: Record<UploadKey, UploadInfo>
  warnings: string[]
}

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
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
  stockCost: 0,
  stockSale: 0,
  stockTransit: 0,
  stockUnits: 0,
  stockBoxes: 0,
  stockMatched: 0,
  sellOutTarget: 0,
  networkPoolTarget: 0,
  industryTarget: 0,
  industryPositiveTarget: 0,
  networks: [],
  sellers: [],
  stockLines: [],
  daily: Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, () => 0),
  salesSellerActuals: [],
  sellerTargets: [],
  salesCustomers: [],
  rcaByOldCode: {},
  networkByCnpj: {},
  historyByMonth: {},
  stockItems: [],
  catalogFinanceByCode: {},
  positionFinanceByCode: {},
  uploads: emptyUploads,
  warnings: [],
}

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialState
    const parsed = JSON.parse(saved)
    return { ...initialState, ...parsed, uploads: { ...emptyUploads, ...parsed.uploads } } as AppState
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
  return (
    <input
      className="currency-input"
      value={editing ? draft : money.format(value)}
      onFocus={() => { setEditing(true); setDraft(value.toFixed(2).replace('.', ',')) }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { onChange(parseCurrency(draft)); setEditing(false) }}
    />
  )
}

function Metric({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</article>
}

function Title({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return <div className="title"><span>{kicker}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
}

function fileInfo(file: File, rows?: number, detail?: string): UploadInfo {
  return { name: file.name, size: file.size, updatedAt: new Date().toISOString(), rows, detail }
}

function previousMonthKey(state: AppState) {
  return `${state.periodYear - 1}-${String(state.periodMonth).padStart(2, '0')}`
}

function recalcState(current: AppState, patch: Partial<AppState>): AppState {
  const next = { ...current, ...patch }
  next.sellers = mergeSellers(next.sellerTargets, next.salesSellerActuals, next.rcaByOldCode)
  const activeFinance = Object.keys(next.positionFinanceByCode).length ? next.positionFinanceByCode : next.catalogFinanceByCode
  const stock = stockFinancial(next.stockItems, activeFinance)
  next.stockLines = stock.lines
  next.stockCost = stock.totalCost
  next.stockSale = stock.totalSale
  next.stockMatched = stock.matchedItems
  next.networks = buildNetworks(
    next.salesCustomers,
    next.networkByCnpj,
    next.historyByMonth[previousMonthKey(next)],
    next.networkPoolTarget,
  )
  return next
}

function TargetFooter({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const achievement = state.sellOutTarget > 0 ? state.sellOut / state.sellOutTarget : 0
  return (
    <section className="target-footer">
      <div className="target-copy"><span>META SELL OUT • T&C</span><h3>Referência gerencial do mês</h3><p>Meta manual e independente da soma das metas dos vendedores da Bússola.</p></div>
      <div className="target-field"><label>Meta do mês</label><CurrencyInput value={state.sellOutTarget} onChange={(value) => setState(current => ({ ...current, sellOutTarget: value }))} /></div>
      <div className="target-result"><strong>{state.sellOutTarget > 0 ? percent.format(achievement) : '—'}</strong><span>atingido</span><div className="progress"><i style={{ width: `${Math.min(100, achievement * 100)}%` }} /></div></div>
    </section>
  )
}

function App() {
  const [page, setPage] = useState<Page>('resumo')
  const [state, setState] = useState<AppState>(loadState)
  const [processing, setProcessing] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      setError('A base processada ficou grande demais para o armazenamento local deste navegador. Se isso persistir, migraremos a persistência para IndexedDB.')
    }
  }, [state])

  const networkTarget = useMemo(() => state.networks.reduce((sum, item) => sum + item.target, 0), [state.networks])
  const networkSellOut = useMemo(() => state.networks.reduce((sum, item) => sum + item.sellOut, 0), [state.networks])
  const hasSales = Boolean(state.uploads.sales)

  function addWarnings(current: AppState, source: string, warnings: string[]) {
    const cleaned = current.warnings.filter(item => !item.startsWith(`${source}:`))
    return [...cleaned, ...warnings.map(item => `${source}: ${item}`)]
  }

  async function processUpload(key: UploadKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setProcessing(`Processando ${file.name}...`)
    setError('')
    try {
      if (key === 'sales') {
        const result = await parseSales(file)
        setState(current => recalcState(current, {
          periodYear: result.periodYear,
          periodMonth: result.periodMonth,
          periodLabel: result.periodLabel,
          sellOut: result.sellOut,
          billed: result.billed,
          toInvoice: result.toInvoice,
          potentialPositives: result.potentialPositives,
          daily: result.daily,
          salesSellerActuals: result.sellers,
          salesCustomers: result.customers,
          uploads: { ...current.uploads, sales: fileInfo(file, result.rows, `${money.format(result.sellOut)} no período`) },
          warnings: addWarnings(current, '8022', result.warnings),
        }))
      } else if (key === 'targets') {
        const result = await parseBussola(file)
        setState(current => recalcState(current, {
          sellerTargets: result.sellers,
          industryTarget: result.industryTarget,
          industryPositiveTarget: result.industryPositiveTarget,
          uploads: { ...current.uploads, targets: fileInfo(file, result.rows, `${result.sellers.length} linhas Colgate`) },
          warnings: addWarnings(current, 'Bússola', result.warnings),
        }))
      } else if (key === 'rcas') {
        const result = await parseRcas(file)
        setState(current => recalcState(current, {
          rcaByOldCode: result.byOldCode,
          uploads: { ...current.uploads, rcas: fileInfo(file, result.rows, `${result.rows} RCAs atuais mapeados`) },
          warnings: addWarnings(current, 'RCAs', result.warnings),
        }))
      } else if (key === 'premises') {
        const result = await parsePremises(file)
        setState(current => recalcState(current, {
          networkByCnpj: result.networkByCnpj,
          uploads: { ...current.uploads, premises: fileInfo(file, result.rows, `${result.networks} redes mapeadas`) },
          warnings: addWarnings(current, 'Premissas', result.warnings),
        }))
      } else if (key === 'stock') {
        const result = await parseStock(file)
        setState(current => recalcState(current, {
          stockItems: result.items,
          stockUnits: result.totalUnits,
          stockBoxes: result.totalBoxes,
          uploads: { ...current.uploads, stock: fileInfo(file, result.rows, `${integer.format(result.totalUnits)} unidades`) },
          warnings: addWarnings(current, '8013', result.warnings),
        }))
      } else if (key === 'position') {
        const result = await parsePosition105(file)
        setState(current => recalcState(current, {
          positionFinanceByCode: result.financeByCode,
          uploads: { ...current.uploads, position: fileInfo(file, result.rows, `${result.rows} itens com posição financeira`) },
          warnings: addWarnings(current, '105', result.warnings),
        }))
      } else if (key === 'catalog') {
        const result = await parseCatalog(file)
        setState(current => recalcState(current, {
          catalogFinanceByCode: result.financeByCode,
          uploads: { ...current.uploads, catalog: fileInfo(file, result.rows, result.hasCost ? 'custo localizado' : 'cadastro auxiliar, sem custo reconhecido') },
          warnings: addWarnings(current, '286', result.warnings),
        }))
      } else if (key === 'history') {
        const result = await parseHistory379(file)
        setState(current => recalcState(current, {
          historyByMonth: result.byMonth,
          uploads: { ...current.uploads, history: fileInfo(file, result.rows, 'histórico 379 processado') },
          warnings: addWarnings(current, '379', result.warnings),
        }))
      } else if (key === 'transit') {
        setState(current => ({
          ...current,
          uploads: { ...current.uploads, transit: fileInfo(file, undefined, 'aguardando definição do layout') },
          warnings: addWarnings(current, 'Trânsito', ['Arquivo registrado. O parser será configurado quando validarmos as colunas desse relatório.']),
        }))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao processar o arquivo.')
    } finally {
      setProcessing('')
      event.target.value = ''
    }
  }

  function changeNetworkPool(value: number) {
    setState(current => {
      const networks = current.networks.map(item => ({ ...item }))
      const total = networks.reduce((sum, item) => sum + item.target, 0)
      if (networks.length === 0) return { ...current, networkPoolTarget: value }
      if (total > 0) networks.forEach(item => { item.target = item.target * value / total })
      else {
        const sales = networks.reduce((sum, item) => sum + item.sellOut, 0)
        networks.forEach(item => { item.target = sales > 0 ? value * item.sellOut / sales : value / networks.length })
      }
      return { ...current, networkPoolTarget: value, networks }
    })
  }

  function changeNetworkTarget(index: number, requested: number) {
    setState(current => {
      const networks = current.networks.map(item => ({ ...item }))
      const total = current.networkPoolTarget
      if (total <= 0 || !networks[index]) return current
      const old = networks[index].target
      const value = Math.max(0, Math.min(total, requested))
      const others = total - old
      networks[index].target = value
      if (others > 0) {
        const remaining = total - value
        networks.forEach((item, itemIndex) => {
          if (itemIndex !== index) item.target = item.target / others * remaining
        })
      }
      return { ...current, networks }
    })
  }

  function resetLocal() {
    if (!window.confirm('Apagar a base processada e todas as configurações salvas neste navegador?')) return
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState)
  }

  return (
    <div className="app">
      <header className="header">
        <div><span>MILÊNIO • INTELIGÊNCIA COMERCIAL</span><h1>Painel Sell Out</h1></div>
        <div className="header-status"><b><i className={hasSales ? '' : 'off'} /> {hasSales ? 'Base real local ativa' : 'Aguardando 8022'}</b><strong>{state.periodLabel}</strong></div>
      </header>

      <nav className="tabs">
        {([['resumo', 'Resumo'], ['gerencial', 'Gerencial'], ['equipe', 'Equipe'], ['estoque', 'Estoque'], ['conferencia', 'Conferência'], ['upload', 'Upload de dados']] as [Page, string][]).map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>
        ))}
      </nav>

      {(processing || error) && <div className={`global-message ${error ? 'error' : ''}`}>{error || processing}</div>}

      <main>
        {page === 'resumo' && <Resumo state={state} setState={setState} />}
        {page === 'gerencial' && <Gerencial state={state} setState={setState} totalTarget={networkTarget} totalSellOut={networkSellOut} changePool={changeNetworkPool} changeTarget={changeNetworkTarget} />}
        {page === 'equipe' && <Equipe state={state} setState={setState} />}
        {page === 'estoque' && <Estoque state={state} />}
        {page === 'conferencia' && <Conferencia state={state} />}
        {page === 'upload' && <Upload state={state} processUpload={processUpload} resetLocal={resetLocal} />}
      </main>
    </div>
  )
}

function Resumo({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const maxDaily = Math.max(...state.daily.map(value => Math.abs(value)), 1)
  const sameCurrentMonth = state.periodYear === now.getFullYear() && state.periodMonth === now.getMonth() + 1
  const elapsed = sameCurrentMonth ? Math.max(1, now.getDate()) : Math.max(1, state.daily.filter(value => value !== 0).length)
  return (
    <>
      <section className="hero">
        <div><span>VISÃO EXECUTIVA • {state.periodLabel.toUpperCase()}</span><h2>Venda, estoque e abastecimento.</h2><p>Valores reais processados localmente a partir dos arquivos carregados no painel.</p></div>
        <div><small>Sell Out atual</small><strong>{state.uploads.sales ? money.format(state.sellOut) : '—'}</strong></div>
      </section>

      <section className="metrics five">
        <Metric label="SELL OUT TOTAL" value={state.uploads.sales ? money.format(state.sellOut) : '—'} hint="VENDA + A FATURAR do 8022" tone="red" />
        <Metric label="FATURADO" value={state.uploads.sales ? money.format(state.billed) : '—'} hint={state.sellOut ? `${percent.format(state.billed / state.sellOut)} do Sell Out` : 'Status VENDA do 8022'} tone="navy" />
        <Metric label="VENDA A FATURAR" value={state.uploads.sales ? money.format(state.toInvoice) : '—'} hint="Status A FATURAR do 8022" />
        <Metric label="POSITIVAÇÃO POTENCIAL" value={state.uploads.sales ? integer.format(state.potentialPositives) : '—'} hint="CNPJs únicos com VENDA ou A FATURAR" />
        <Metric label="ESTOQUE FÍSICO" value={state.uploads.stock ? `${integer.format(state.stockUnits)} un.` : '—'} hint="Quantidade disponível do 8013" />
      </section>

      <section className="split summary-split">
        <article className="panel chart-panel">
          <Title kicker="MOVIMENTO DIÁRIO" title="Sell Out por dia" subtitle="O eixo mostra o mês inteiro. Dias futuros aparecem, mas sem valor inventado." />
          {state.uploads.sales ? <div className="bars">
            {state.daily.map((value, index) => {
              const day = index + 1
              const future = sameCurrentMonth && day > now.getDate()
              return <div className={`bar-slot ${future ? 'future' : ''}`} key={day} title={`${day} • ${money.format(value)}`}><i style={{ height: `${value !== 0 ? Math.max(5, Math.abs(value) / maxDaily * 100) : 2}%` }} /><span>{day}</span></div>
            })}
          </div> : <Empty text="Carregue o relatório 8022 na última aba para montar o movimento diário." />}
        </article>
        <article className="panel rhythm">
          <Title kicker="RITMO DO MÊS" title="Referência operacional" />
          <div><span>Média por dia com referência</span><strong>{state.uploads.sales ? money.format(state.sellOut / elapsed) : '—'}</strong></div>
          <div><span>Falta para a meta T&C</span><strong>{state.sellOutTarget > 0 ? money.format(Math.max(0, state.sellOutTarget - state.sellOut)) : '—'}</strong></div>
          <div><span>Progresso da meta T&C</span><strong>{state.sellOutTarget > 0 ? percent.format(state.sellOut / state.sellOutTarget) : '—'}</strong></div>
          <p className="note">A meta T&C é manual. A meta da indústria vem da soma das metas Colgate informadas na Bússola.</p>
        </article>
      </section>
      <TargetFooter state={state} setState={setState} />
    </>
  )
}

function Gerencial({ state, setState, totalTarget, totalSellOut, changePool, changeTarget }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; totalTarget: number; totalSellOut: number; changePool: (value: number) => void; changeTarget: (index: number, value: number) => void }) {
  return (
    <>
      <section className="page-head"><Title kicker="GERENCIAL" title="Redes estratégicas" subtitle="ABV, MEGA, PIRES, NOVA ESTRELA e PORTAL/PRINCESA, cruzadas pelo CNPJ da Base de Premissas Q3." /><div><span>Sell Out das redes estratégicas</span><strong>{state.uploads.sales && state.uploads.premises ? money.format(totalSellOut) : '—'}</strong></div></section>
      <section className="split managerial-split">
        <article className="panel">
          <div className="panel-toolbar"><div><span>REDES ESTRATÉGICAS</span><h3>Participação, meta e realizado</h3></div><div className="pool"><label>Meta total das redes</label><CurrencyInput value={state.networkPoolTarget} onChange={changePool} /><small>Valor manual; a distribuição inicial segue a participação no Sell Out.</small></div></div>
          {state.networks.length ? <div className="network-list">
            {state.networks.map((network, index) => {
              const achievement = network.target > 0 ? network.sellOut / network.target : 0
              const variation = network.previous !== 0 ? network.sellOut / network.previous - 1 : 0
              return <div className="network" key={network.name}>
                <div className="network-name"><strong>{network.name}</strong><span>{totalSellOut > 0 ? percent.format(network.sellOut / totalSellOut) : '—'} do Sell Out estratégico</span></div>
                <div className="editable"><span>Meta</span><CurrencyInput value={network.target} onChange={(value) => changeTarget(index, value)} /></div>
                <div><span>Sell Out</span><strong>{money.format(network.sellOut)}</strong></div>
                <div><span>Atingimento</span><strong>{network.target > 0 ? percent.format(achievement) : '—'}</strong></div>
                <div className="mini-progress"><i style={{ width: `${Math.min(100, achievement * 100)}%` }} /></div>
                {network.previous !== 0 && <small className={variation >= 0 ? 'positive network-variation' : 'negative network-variation'}>{variation >= 0 ? '+' : ''}{percent.format(variation)} vs. histórico</small>}
              </div>
            })}
          </div> : <Empty text="Carregue o 8022 e a Base de Premissas Q3 para montar as redes estratégicas." />}
        </article>
        <article className="panel">
          <Title kicker="COMPARATIVO HISTÓRICO" title="Mesmo mês de 2025" subtitle="O 379 25 é cruzado pelo CNPJ com a rede atual. A regra de operações continua visível como pendência até a validação final." />
          {state.networks.some(item => item.previous !== 0) ? <div className="history">
            {state.networks.map(network => <div key={network.name}><span>{network.name}</span><strong>{money.format(network.previous)}</strong><b>{network.previous ? percent.format(network.sellOut / network.previous - 1) : '—'}</b></div>)}
          </div> : <Empty text="Carregue o 379 25 para habilitar o comparativo histórico." />}
        </article>
      </section>
      <TargetFooter state={state} setState={setState} />
    </>
  )
}

function Equipe({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const sellerTargetTotal = state.sellers.reduce((sum, seller) => sum + seller.target, 0)
  const sellerSellOut = state.sellers.reduce((sum, seller) => sum + seller.sellOut, 0)
  return (
    <>
      <section className="page-head dark"><Title kicker="EQUIPE COMERCIAL" title="Realizado por RCA atual" subtitle="O NOVOS RCAS faz o de/para do setor antigo da Bússola/8022 para o código atual do RCA." /><div><span>Sell Out identificado nos RCAs atuais</span><strong>{state.uploads.sales ? money.format(sellerSellOut) : '—'}</strong></div></section>
      <section className="table-panel panel">
        <div className="table-title"><div><span>RCAS</span><h3>Meta, realizado e positivação</h3></div><b>{state.sellers.length ? `${state.sellers.length} RCAS` : 'SEM BASE'}</b></div>
        {state.sellers.length ? <div className="table-scroll"><table><thead><tr><th>RCA atual</th><th>Vendedor</th><th>Meta Bússola</th><th>Sell Out</th><th>Ating.</th><th>Positivação</th><th>Meta Pos.</th><th>Ating. Pos.</th></tr></thead><tbody>
          {state.sellers.map(seller => <tr key={seller.code}><td><b>{seller.code}</b></td><td>{seller.name}</td><td>{seller.target ? money.format(seller.target) : '—'}</td><td>{money.format(seller.sellOut)}</td><td>{seller.target ? percent.format(seller.sellOut / seller.target) : '—'}</td><td>{integer.format(seller.positives)}</td><td>{seller.positiveTarget ? integer.format(seller.positiveTarget) : '—'}</td><td>{seller.positiveTarget ? percent.format(seller.positives / seller.positiveTarget) : '—'}</td></tr>)}
        </tbody></table></div> : <Empty text="Carregue Bússola, NOVOS RCAS e 8022 para cruzar metas e realizado pelo RCA atual." />}
      </section>
      <section className="industry-footer"><div><span>METAS COLGATE • BÚSSOLA</span><h3>Fechamento de referência da equipe</h3><p>A meta da indústria continua sendo a soma informada na Bússola; NOVOS RCAS corrige a identificação do quadro atual.</p></div><div><span>Meta indústria</span><strong>{state.uploads.targets ? money.format(state.industryTarget || sellerTargetTotal) : '—'}</strong></div><div><span>Meta positivação</span><strong>{state.uploads.targets ? integer.format(state.industryPositiveTarget) : '—'}</strong></div></section>
      <TargetFooter state={state} setState={setState} />
    </>
  )
}

function Estoque({ state }: { state: AppState }) {
  const financialReady = state.stockMatched > 0
  const positionActive = Boolean(state.uploads.position)
  return (
    <>
      <section className="page-head"><Title kicker="ESTOQUE" title="Posição física e financeira" subtitle="O 8013 fornece o físico; o relatório 105 passa a ser a fonte preferencial de custo e preço de venda." /><div><span>Itens do 8013 casados com a fonte financeira</span><strong>{state.stockItems.length ? `${integer.format(state.stockMatched)} / ${integer.format(state.stockItems.length)}` : '—'}</strong></div></section>
      <section className="metrics four">
        <Metric label="ESTOQUE EM UNIDADES" value={state.uploads.stock ? integer.format(state.stockUnits) : '—'} hint="8013" tone="navy" />
        <Metric label="ESTOQUE EM CAIXAS" value={state.uploads.stock ? decimal.format(state.stockBoxes) : '—'} hint="8013" />
        <Metric label="ESTOQUE AO CUSTO" value={financialReady ? money.format(state.stockCost) : '—'} hint={financialReady ? (positionActive ? '105 • coluna Real provisoriamente' : 'Fonte financeira auxiliar') : 'Carregue o relatório 105'} tone="red" />
        <Metric label="ESTOQUE A PREÇO DE VENDA" value={financialReady && state.stockSale ? money.format(state.stockSale) : '—'} hint={positionActive ? '105 • P. Venda' : 'Somente quando houver preço reconhecido'} />
      </section>
      <section className="table-panel panel">
        <div className="table-title"><div><span>POSIÇÃO POR LINHA</span><h3>Classificação auditável</h3></div><b>REGRA DE LINHA A VALIDAR</b></div>
        {state.stockLines.length ? <div className="table-scroll"><table><thead><tr><th>Linha</th><th>Unidades</th><th>Caixas</th><th>Custo</th><th>Preço venda</th><th>Itens casados</th><th>Regra usada</th></tr></thead><tbody>
          {state.stockLines.map(line => <tr key={line.name}><td><b>{line.name}</b></td><td>{integer.format(line.units)}</td><td>{decimal.format(line.boxes)}</td><td>{line.matched ? money.format(line.cost) : '—'}</td><td>{line.matched && line.sale ? money.format(line.sale) : '—'}</td><td>{line.matched} / {line.total}</td><td className="rule-cell">{line.rule}</td></tr>)}
        </tbody></table></div> : <Empty text="Carregue o estoque 8013 para montar a posição física." />}
      </section>
      <p className="note stock-note">O 105 resolveu a fonte financeira, mas ainda precisamos confirmar qual coluna representa oficialmente “ao custo”: Real, Real+ICMS, Financ. ou Pr. Comp. A divisão por linha continua provisória até validarmos um campo oficial de categoria.</p>
    </>
  )
}

function Conferencia({ state }: { state: AppState }) {
  const loaded = Object.entries(state.uploads).filter(([, info]) => info)
  return (
    <>
      <section className="page-head"><Title kicker="CONFERÊNCIA" title="Fontes e pendências" subtitle="Tudo o que foi processado e qualquer regra ainda não validada aparecem aqui." /><div><span>Fontes carregadas</span><strong>{loaded.length} / {Object.keys(state.uploads).length}</strong></div></section>
      <section className="split">
        <article className="panel"><Title kicker="BASE LOCAL" title="Arquivos processados" />
          <div className="source-list">{Object.entries(state.uploads).map(([key, info]) => <div key={key}><span>{sourceLabel(key as UploadKey)}</span><strong>{info?.name ?? 'Não carregado'}</strong><small>{info?.detail ?? ''}</small></div>)}</div>
        </article>
        <article className="panel"><Title kicker="PENDÊNCIAS" title="Regras que ainda exigem validação" />
          {state.warnings.length ? <ul className="warning-list">{state.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul> : <Empty text="Nenhuma pendência registrada." />}
        </article>
      </section>
    </>
  )
}

function Upload({ state, processUpload, resetLocal }: { state: AppState; processUpload: (key: UploadKey, event: ChangeEvent<HTMLInputElement>) => Promise<void>; resetLocal: () => void }) {
  const cards: { key: UploadKey; title: string; subtitle: string; accept: string }[] = [
    { key: 'sales', title: 'VENDAS • RELATÓRIO 8022', subtitle: 'VENDA, A FATURAR, RCA/setor, cliente e movimento diário.', accept: '.xls,.xlsx' },
    { key: 'targets', title: 'METAS • BÚSSOLA COLGATE', subtitle: 'Metas de Sell Out e positivação informadas pela Colgate.', accept: '.xlsx,.xls' },
    { key: 'rcas', title: 'EQUIPE ATUAL • NOVOS RCAS', subtitle: 'De/para do setor antigo para o código atual do RCA e coordenação.', accept: '.xlsx,.xls' },
    { key: 'premises', title: 'BASE DE PREMISSAS • Q3', subtitle: 'Vínculo CNPJ → rede, usado nas redes estratégicas.', accept: '.xlsx,.xls' },
    { key: 'stock', title: 'ESTOQUE FÍSICO • RELATÓRIO 8013', subtitle: 'Unidades, caixas, produto e categoria.', accept: '.xls,.xlsx' },
    { key: 'position', title: 'POSIÇÃO FINANCEIRA • RELATÓRIO 105', subtitle: 'Custo e preço de venda da posição; fonte financeira preferencial do estoque.', accept: '.xls,.xlsx' },
    { key: 'catalog', title: 'CADASTRO DE ITENS • 286', subtitle: 'Cadastro auxiliar de produtos; não substitui o 105 quando ele estiver carregado.', accept: '.xls,.xlsx' },
    { key: 'history', title: 'HISTÓRICO • 379 2025', subtitle: 'Comparativo das redes no mesmo mês do ano anterior.', accept: '.txt' },
    { key: 'transit', title: 'COLGATE → MILÊNIO • EM TRÂNSITO', subtitle: 'Fonte opcional; layout ainda será validado.', accept: '.xls,.xlsx,.csv,.txt' },
  ]
  return (
    <>
      <section className="upload-hero"><span>ENTRADA DE DADOS</span><h2>Atualize a base sem perder o painel.</h2><p>Os arquivos são processados no próprio navegador. Eles não são enviados para o GitHub nem para um servidor do painel. O que fica salvo localmente são os resultados processados necessários para restaurar a tela após F5.</p></section>
      <section className="upload-grid">
        {cards.map(card => <label className="upload-card" key={card.key}><div><span>{card.title}</span><p>{card.subtitle}</p></div><input type="file" accept={card.accept} onChange={(event) => void processUpload(card.key, event)} /><strong>{state.uploads[card.key]?.name ?? 'Selecionar arquivo'}</strong><small>{state.uploads[card.key]?.detail ?? 'Nenhum arquivo processado'}</small></label>)}
      </section>
      <section className="storage"><div><span>PERSISTÊNCIA LOCAL</span><h3>Última base válida preservada no navegador</h3><p>Atualizar a página não apaga os resultados processados nem as metas manuais.</p></div><button onClick={resetLocal}>Limpar base local</button></section>
    </>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function sourceLabel(key: UploadKey) {
  return ({
    sales: '8022 • Vendas',
    targets: 'Bússola • Metas',
    rcas: 'Novos RCAs • Equipe atual',
    premises: 'Premissas Q3 • Redes',
    stock: '8013 • Estoque físico',
    position: '105 • Posição financeira',
    catalog: '286 • Cadastro auxiliar',
    history: '379 2025 • Histórico',
    transit: 'Em trânsito',
  })[key]
}

export default App
