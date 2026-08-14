import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

type SellerActual = {
  code?: string
  name?: string
  billedPositives?: number
  toInvoicePositives?: number
  positives?: number
}

type SellerTarget = {
  code?: string
  name?: string
  positiveTarget?: number
}

type RcaEntry = {
  currentCode?: string
  name?: string
  coordinatorName?: string
}

type StoredState = {
  billedPositives?: number
  potentialPositives?: number
  salesSellerActuals?: SellerActual[]
  sellerTargets?: SellerTarget[]
  rcaByOldCode?: Record<string, RcaEntry>
  uploads?: { sales?: unknown; targets?: unknown; rcas?: unknown }
}

type SellerRow = {
  code: string
  name: string
  coordinator: string
  target: number
  billed: number
  pending: number
  total: number
}

function readState(): StoredState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function currentEntry(code: string, map: Record<string, RcaEntry>) {
  if (map[code]) return map[code]
  return Object.values(map).find(entry => String(entry.currentCode ?? '') === code)
}

function currentCode(code: string, map: Record<string, RcaEntry>) {
  const entry = currentEntry(code, map)
  return String(entry?.currentCode || code)
}

function buildSellerRows(state: StoredState): SellerRow[] {
  const map = state.rcaByOldCode ?? {}
  const rows = new Map<string, SellerRow>()

  for (const actual of state.salesSellerActuals ?? []) {
    const rawCode = String(actual.code ?? '')
    const code = currentCode(rawCode, map)
    const entry = currentEntry(rawCode, map)
    const row = rows.get(code) ?? {
      code,
      name: String(entry?.name || actual.name || `RCA ${code}`),
      coordinator: String(entry?.coordinatorName || ''),
      target: 0,
      billed: 0,
      pending: 0,
      total: 0,
    }
    row.billed += Number(actual.billedPositives) || 0
    row.pending += Number(actual.toInvoicePositives) || 0
    row.total += Number(actual.positives) || 0
    rows.set(code, row)
  }

  for (const target of state.sellerTargets ?? []) {
    const rawCode = String(target.code ?? '')
    const code = currentCode(rawCode, map)
    const entry = currentEntry(rawCode, map)
    const row = rows.get(code) ?? {
      code,
      name: String(entry?.name || target.name || `RCA ${code}`),
      coordinator: String(entry?.coordinatorName || ''),
      target: 0,
      billed: 0,
      pending: 0,
      total: 0,
    }
    row.target += Number(target.positiveTarget) || 0
    rows.set(code, row)
  }

  return [...rows.values()].sort((a, b) => b.total - a.total || Number(a.code) - Number(b.code))
}

function PositivityAudit({ state, page }: { state: StoredState; page: string }) {
  const billed = Number(state.billedPositives) || 0
  const total = Number(state.potentialPositives) || 0
  const pending = Math.max(0, total - billed)
  const closes = billed + pending === total
  const sellerRows = useMemo(() => buildSellerRows(state), [state])
  const sellerTotal = sellerRows.reduce((sum, row) => sum + row.total, 0)

  if (page === 'equipe') {
    return <section className="panel section-block positivity-audit-panel positivity-team-panel">
      <div className="section-bar">
        <div><span>POSITIVAÇÃO POR RCA</span><h2>Faturada, a faturar e potencial</h2></div>
        <div className="status-pill ok">{integer.format(total)} clientes únicos no mês</div>
      </div>
      <div className="table-scroll">
        <table className="positivity-table">
          <thead><tr><th>RCA</th><th>Vendedor</th><th>Coord.</th><th>Meta Pos.</th><th>Fat.</th><th>Somente a fat.</th><th>Potencial</th><th>Ating. fat.</th><th>Ating. potencial</th></tr></thead>
          <tbody>{sellerRows.map(row => <tr key={row.code}>
            <td><b>{row.code}</b></td>
            <td>{row.name}</td>
            <td>{row.coordinator || '—'}</td>
            <td>{row.target ? integer.format(row.target) : '—'}</td>
            <td><b>{integer.format(row.billed)}</b></td>
            <td>{row.pending ? `+${integer.format(row.pending)}` : '0'}</td>
            <td><b>{integer.format(row.total)}</b></td>
            <td>{row.target ? percent.format(row.billed / row.target) : '—'}</td>
            <td>{row.target ? percent.format(row.total / row.target) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {sellerTotal !== total && <div className="positivity-note">A soma por RCA é {integer.format(sellerTotal)}. Ela pode ser maior que os {integer.format(total)} clientes únicos globais quando o mesmo CNPJ aparece em mais de um RCA no período.</div>}
    </section>
  }

  return <section className="panel section-block positivity-audit-panel">
    <div className="section-bar">
      <div><span>AUDITORIA DE POSITIVAÇÃO</span><h2>Fechamento do 8022</h2></div>
      <div className={`status-pill ${closes ? 'ok' : 'warn'}`}>{closes ? 'Fechamento OK' : 'Revisar'}</div>
    </div>
    <div className="positivity-audit-grid">
      <article><span>EFETIVA FATURADA</span><strong>{integer.format(billed)}</strong><small>Clientes com faturamento líquido positivo</small></article>
      <article><span>SOMENTE A FATURAR</span><strong>+{integer.format(pending)}</strong><small>Ainda não entram no realizado efetivo</small></article>
      <article><span>POTENCIAL TOTAL</span><strong>{integer.format(total)}</strong><small>CNPJ único, sem duplicar faturado + pendente</small></article>
      <article className={closes ? 'ok' : 'warn'}><span>CONFERÊNCIA</span><strong>{integer.format(billed)} + {integer.format(pending)} = {integer.format(total)}</strong><small>{closes ? 'Regra fechada' : 'Existe divergência'}</small></article>
    </div>
  </section>
}

export default function PositivityAuditOverlay() {
  const [state, setState] = useState<StoredState>(() => readState())
  const [page, setPage] = useState(() => document.documentElement.dataset.dashboardPage ?? '')
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      const nextPage = document.documentElement.dataset.dashboardPage ?? ''
      setPage(nextPage)
      setTarget(document.querySelector<HTMLElement>('.v3-main'))
      const raw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (raw !== lastRaw) {
        lastRaw = raw
        setState(readState())
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 500)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.clearInterval(timer)
      observer.disconnect()
    }
  }, [])

  if (!target || !state.uploads?.sales || !['conferencia', 'equipe'].includes(page)) return null
  return createPortal(<PositivityAudit state={state} page={page} />, target)
}
