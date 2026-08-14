import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { mergeSellers, RcaEntry, SellerSales, SellerTarget } from './data'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const

type ProductLineName = typeof LINE_NAMES[number]
type SellerWithLines = SellerSales & { lineSales?: Partial<Record<ProductLineName, number>> }

type StoredState = {
  sellOut?: number
  uploads?: { sales?: unknown; rcas?: unknown; position?: unknown; transit?: unknown; targets?: unknown }
  salesSellerActuals?: SellerWithLines[]
  sellerTargets?: SellerTarget[]
  rcaByOldCode?: Record<string, RcaEntry>
  industryTarget?: number
  positionCost?: number
  positionSale?: number
  positionRows?: number
  stockTransit?: number
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
  const active = [...document.querySelectorAll<HTMLButtonElement>('.tabs button')]
    .find(button => button.classList.contains('active'))
  return pageFromLabel(active?.textContent ?? 'Resumo')
}

function findTab(label: string) {
  const wanted = label.toLowerCase()
  return [...document.querySelectorAll<HTMLButtonElement>('.tabs button')]
    .find(button => pageFromLabel(button.textContent ?? '') === wanted)
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
    'Sabonetes': 'SABONETES',
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
  return <section className="panel section-block safe-stock-summary">
    <div className="section-bar"><div><span>RESUMO DO ESTOQUE</span><h2>Posição financeira consolidada</h2></div></div>
    <div className="metrics enhanced-metrics four safe-stock-kpis">
      <article className="metric red"><span>ESTOQUE ATUAL AO CUSTO</span><strong>{hasPosition ? money.format(Number(state.positionCost) || 0) : '—'}</strong></article>
      <article className="metric navy"><span>ABASTECIMENTO EM TRÂNSITO</span><strong>{state.uploads?.transit ? money.format(Number(state.stockTransit) || 0) : '—'}</strong></article>
      <article className="metric"><span>POSIÇÃO AO CUSTO + TRÂNSITO</span><strong>{hasPosition ? money.format((Number(state.positionCost) || 0) + (Number(state.stockTransit) || 0)) : '—'}</strong></article>
      <article className="metric"><span>ESTOQUE A PREÇO DE VENDA</span><strong>{hasPosition ? money.format(Number(state.positionSale) || 0) : '—'}</strong></article>
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

function StockSidebarButton({ active }: { active: boolean }) {
  return <button
    className={`module-item safe-stock-module ${active ? 'active' : ''}`}
    onClick={() => findTab('estoque')?.click()}
    title="Estoque"
  >
    <span className="module-number">02</span>
    <span className="module-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="M4.5 7.8 12 12l7.5-4.2" />
        <path d="M12 12v9" />
      </svg>
    </span>
    <span className="module-label"><b>ESTOQUE</b><small>Posição & abastecimento</small></span>
  </button>
}

export default function SafeLayoutRedistribution() {
  const [page, setPage] = useState(() => readActivePage())
  const [state, setState] = useState<StoredState>(() => readStoredState())
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    document.documentElement.dataset.dashboardPage = page
    return () => { delete document.documentElement.dataset.dashboardPage }
  }, [page])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.tabs button')
      if (!button) return
      const next = pageFromLabel(button.textContent ?? '')
      if (next) setPage(next)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      const nextMain = document.querySelector<HTMLElement>('main.v3-main')
      const nextNav = document.querySelector<HTMLElement>('.module-nav')
      setMainTarget(current => current === nextMain ? current : nextMain)
      setNavTarget(current => current === nextNav ? current : nextNav)

      const actualPage = readActivePage()
      setPage(current => current === actualPage ? current : actualPage)

      const raw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (raw !== lastRaw) {
        lastRaw = raw
        setState(readStoredState())
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <>
    {navTarget && createPortal(<StockSidebarButton active={page === 'estoque'} />, navTarget)}
    {mainTarget && page === 'resumo' && createPortal(<>
      <ProductLineSummary state={state} />
      <StockSummary state={state} />
    </>, mainTarget)}
    {mainTarget && page === 'gerencial' && createPortal(<TeamGerencial state={state} />, mainTarget)}
  </>
}
