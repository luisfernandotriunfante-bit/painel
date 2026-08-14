import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseTopRetailerRoteiro, topTargetForNetwork, TopRetailerGroup } from './topRetailer'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'

type NetworkTarget = { target: number; locked: boolean }
type Customer = { cnpj: string; value: number; billed?: number; toInvoice?: number }
type StoredState = {
  periodYear?: number
  periodMonth?: number
  strategicNetworks?: string[]
  networkTargets?: Record<string, NetworkTarget>
  networkByCnpj?: Record<string, string>
  salesCustomers?: Customer[]
  historyByMonth?: Record<string, Record<string, number>>
  topRetailerGroups?: TopRetailerGroup[]
  topRetailerUpload?: { name: string; updatedAt: string; rows: number; totalTarget: number; monthLabel: string; warnings: string[] }
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

function readState(): StoredState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  catch { return {} }
}

function previousKey(state: StoredState) {
  const year = Number(state.periodYear) || new Date().getFullYear()
  const month = Number(state.periodMonth) || new Date().getMonth() + 1
  return `${year - 1}-${String(month).padStart(2, '0')}`
}

function networkRows(state: StoredState) {
  const names = state.strategicNetworks ?? []
  const current = new Map<string, { billed: number; toInvoice: number; sellOut: number; cnpjs: Set<string> }>()
  names.forEach(name => current.set(name, { billed: 0, toInvoice: 0, sellOut: 0, cnpjs: new Set() }))
  for (const customer of state.salesCustomers ?? []) {
    const name = state.networkByCnpj?.[customer.cnpj]
    const bucket = name ? current.get(name) : undefined
    if (!bucket) continue
    const billed = Number(customer.billed) || 0
    const toInvoice = Number(customer.toInvoice) || 0
    const sellOut = Number(customer.value) || billed + toInvoice
    bucket.billed += billed
    bucket.toInvoice += toInvoice
    bucket.sellOut += sellOut
    bucket.cnpjs.add(customer.cnpj)
  }
  const prevMap = state.historyByMonth?.[previousKey(state)] ?? {}
  const prev = new Map<string, number>()
  names.forEach(name => prev.set(name, 0))
  for (const [cnpj, value] of Object.entries(prevMap)) {
    const name = state.networkByCnpj?.[cnpj]
    if (name && prev.has(name)) prev.set(name, (prev.get(name) ?? 0) + Number(value || 0))
  }
  return names.map(name => {
    const top = topTargetForNetwork(state.topRetailerGroups, name)
    return {
      name,
      customers: current.get(name)?.cnpjs.size ?? 0,
      billed: current.get(name)?.billed ?? 0,
      toInvoice: current.get(name)?.toInvoice ?? 0,
      sellOut: current.get(name)?.sellOut ?? 0,
      networkTarget: Number(state.networkTargets?.[name]?.target) || 0,
      topTarget: top.target,
      topMatched: top.matched,
      topCustomers: top.customers,
      previous: prev.get(name) ?? 0,
    }
  })
}

function NetworksDataOnly({ state }: { state: StoredState }) {
  const rows = useMemo(() => networkRows(state), [state])
  const sellOut = rows.reduce((sum, row) => sum + row.sellOut, 0)
  const billed = rows.reduce((sum, row) => sum + row.billed, 0)
  const toInvoice = rows.reduce((sum, row) => sum + row.toInvoice, 0)
  const target = rows.reduce((sum, row) => sum + row.networkTarget, 0)
  const topTarget = rows.reduce((sum, row) => sum + row.topTarget, 0)

  return <div className="top-network-data-page">
    <section className="metrics enhanced-metrics four top-network-kpis">
      <article className="metric red"><span>SELL OUT REDES</span><strong>{money.format(sellOut)}</strong></article>
      <article className="metric"><span>FATURADO REDES</span><strong>{money.format(billed)}</strong></article>
      <article className="metric"><span>A FATURAR REDES</span><strong>{money.format(toInvoice)}</strong></article>
      <article className="metric navy"><span>META REDES</span><strong>{target ? money.format(target) : '—'}</strong></article>
    </section>
    <section className="panel section-block top-network-panel">
      <div className="section-bar"><div><span>REDES</span><h2>Acompanhamento consolidado</h2></div><div className={`status-pill ${state.topRetailerUpload ? 'ok' : 'warn'}`}>{state.topRetailerUpload ? `Top ${state.topRetailerUpload.monthLabel} carregado` : 'Roteiro Top não carregado'}</div></div>
      <div className="top-network-summary-strip"><div><span>META REDES</span><strong>{target ? money.format(target) : '—'}</strong></div><div><span>META TOPS</span><strong>{state.topRetailerUpload ? money.format(topTarget) : '—'}</strong></div><div><span>TOPS IDENTIFICADOS</span><strong>{rows.filter(row => row.topMatched).length} / {rows.length}</strong></div></div>
      <div className="table-scroll"><table className="top-network-table"><thead><tr><th>Rede</th><th>CNPJs</th><th>Meta Redes</th><th>Meta Tops</th><th>Faturado</th><th>A faturar</th><th>Realizado + A fat.</th><th>% Redes</th><th>% Tops</th><th>Gap Redes</th><th>Gap Tops</th><th>2025</th><th>Var.</th></tr></thead><tbody>{rows.map(row => {
        const variation = row.previous ? row.sellOut / row.previous - 1 : null
        return <tr key={row.name}><td><b>{row.name}</b>{state.topRetailerUpload && !row.topMatched && <small className="top-network-out">Fora do Top no mês</small>}</td><td>{row.customers}</td><td>{row.networkTarget ? money.format(row.networkTarget) : '—'}</td><td>{state.topRetailerUpload ? (row.topMatched ? money.format(row.topTarget) : '—') : '—'}</td><td>{money.format(row.billed)}</td><td>{money.format(row.toInvoice)}</td><td><b>{money.format(row.sellOut)}</b></td><td>{row.networkTarget ? percent.format(row.sellOut / row.networkTarget) : '—'}</td><td>{row.topTarget ? percent.format(row.sellOut / row.topTarget) : '—'}</td><td>{row.networkTarget ? money.format(row.sellOut - row.networkTarget) : '—'}</td><td>{row.topTarget ? money.format(row.sellOut - row.topTarget) : '—'}</td><td>{row.previous ? money.format(row.previous) : '—'}</td><td className={variation == null ? '' : variation >= 0 ? 'positive' : 'negative'}>{variation == null ? '—' : `${variation >= 0 ? '+' : ''}${percent.format(variation)}`}</td></tr>
      })}</tbody></table></div>
    </section>
  </div>
}

function TopMetaReference({ state }: { state: StoredState }) {
  const rows = useMemo(() => networkRows(state), [state])
  return <section className="panel section-block top-meta-reference">
    <div className="section-bar"><div><span>META TOP VAREJISTAS</span><h2>Meta importada do Roteiro Ativo mensal</h2></div><div className={`status-pill ${state.topRetailerUpload ? 'ok' : 'warn'}`}>{state.topRetailerUpload ? `${state.topRetailerUpload.name}` : 'Arquivo mensal não carregado'}</div></div>
    {state.topRetailerUpload ? <><div className="top-meta-reference-kpis"><div><span>COMPETÊNCIA</span><strong>{state.topRetailerUpload.monthLabel}</strong></div><div><span>CNPJs MILÊNIO</span><strong>{integer.format(state.topRetailerUpload.rows)}</strong></div><div><span>META TOP TOTAL</span><strong>{money.format(state.topRetailerUpload.totalTarget)}</strong></div><div><span>GRUPOS TOP</span><strong>{integer.format(state.topRetailerGroups?.length ?? 0)}</strong></div></div><div className="table-scroll"><table><thead><tr><th>Rede configurada</th><th>Meta Redes</th><th>Meta Tops</th><th>CNPJs Top</th><th>Situação</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td><b>{row.name}</b></td><td>{row.networkTarget ? money.format(row.networkTarget) : '—'}</td><td>{row.topMatched ? money.format(row.topTarget) : '—'}</td><td>{row.topMatched ? row.topCustomers : '—'}</td><td>{row.topMatched ? <span className="top-match-ok">No programa Top</span> : <span className="top-match-off">Fora do roteiro do mês</span>}</td></tr>)}</tbody></table></div></> : <div className="empty-state compact-empty">Carregue o Roteiro Ativo Top Varejistas do mês em Upload de dados. A Meta Tops será calculada automaticamente pela soma da coluna META, agrupada por COD AGRUPAMENTO/CNPJ GESTOR.</div>}
  </section>
}

function TopUpload({ onUploaded }: { onUploaded: () => void }) {
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setProcessing(true); setMessage('')
    try {
      const result = await parseTopRetailerRoteiro(file)
      const current = readState()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, topRetailerGroups: result.groups, topRetailerUpload: { name: file.name, updatedAt: new Date().toISOString(), rows: result.rows, totalTarget: result.totalTarget, monthLabel: result.fileMonthLabel, warnings: result.warnings } }))
      setMessage(`${result.rows} CNPJs Milênio • ${result.groups.length} grupos • ${money.format(result.totalTarget)} Meta Tops`)
      onUploaded()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao processar o Roteiro Top.') }
    finally { setProcessing(false); event.target.value = '' }
  }
  const state = readState()
  return <section className="panel section-block top-retailer-upload"><div className="section-bar"><div><span>TOP VAREJISTAS</span><h2>Roteiro Ativo mensal</h2></div></div><label className="top-retailer-upload-card"><input type="file" accept=".xlsx,.xls" onChange={event => void upload(event)} /><span>{processing ? 'PROCESSANDO...' : 'CARREGAR ROTEIRO TOP VAREJISTAS'}</span><strong>{state.topRetailerUpload?.name ?? 'Selecionar arquivo mensal'}</strong><small>{message || (state.topRetailerUpload ? `${state.topRetailerUpload.rows} CNPJs • ${money.format(state.topRetailerUpload.totalTarget)}` : 'A Meta Tops e a composição do programa serão atualizadas automaticamente.')}</small></label></section>
}

export default function TopRetailerIntegration() {
  const [main, setMain] = useState<HTMLElement | null>(null)
  const [page, setPage] = useState('')
  const [state, setState] = useState<StoredState>(() => readState())
  useEffect(() => {
    let raw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      setMain(document.querySelector<HTMLElement>('main.v3-main'))
      setPage(document.documentElement.dataset.dashboardPage ?? '')
      const nextRaw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (nextRaw !== raw) { raw = nextRaw; setState(readState()) }
    }
    refresh(); const timer = window.setInterval(refresh, 500); return () => window.clearInterval(timer)
  }, [])
  if (!main) return null
  return <>
    {page === 'equipe' && createPortal(<NetworksDataOnly state={state} />, main)}
    {page === 'metas' && createPortal(<TopMetaReference state={state} />, main)}
    {(page === 'upload de dados' || page === 'upload') && createPortal(<TopUpload onUploaded={() => setState(readState())} />, main)}
  </>
}
