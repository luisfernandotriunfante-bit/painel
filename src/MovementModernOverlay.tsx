import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

type DailyMovement = {
  day: number
  billed: number
  toInvoice: number
  sellOut: number
  positives: number
  billedPositives?: number
  toInvoicePositives?: number
}

type StoredState = {
  periodYear?: number
  periodMonth?: number
  dailyMovement?: DailyMovement[]
  uploads?: { sales?: unknown }
}

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const compactMoney = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

function readStoredState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function effectivePositives(item: DailyMovement) {
  return item.billedPositives == null ? Number(item.positives) || 0 : Number(item.billedPositives) || 0
}

function pendingOnlyPositives(item: DailyMovement) {
  if (item.toInvoicePositives != null) return Number(item.toInvoicePositives) || 0
  return Math.max(0, (Number(item.positives) || 0) - effectivePositives(item))
}

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    const midX = (current.x + next.x) / 2
    const midY = (current.y + next.y) / 2
    d += ` Q ${current.x} ${current.y} ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  d += ` T ${last.x} ${last.y}`
  return d
}

function areaPath(points: { x: number; y: number }[], baseline: number) {
  if (!points.length) return ''
  const line = smoothPath(points)
  return `${line} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
}

function MovementModern({ state }: { state: StoredState }) {
  const now = new Date()
  const year = Number(state.periodYear) || now.getFullYear()
  const month = Number(state.periodMonth) || now.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const naturalEnd = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth
  const minimumEnd = Math.min(7, Math.max(1, naturalEnd))
  const [endDay, setEndDay] = useState(Math.max(minimumEnd, naturalEnd))

  useEffect(() => {
    setEndDay(Math.max(minimumEnd, naturalEnd))
  }, [year, month, naturalEnd, minimumEnd])

  const allDays = useMemo(() => {
    const source = new Map((state.dailyMovement ?? []).map(item => [item.day, item]))
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1
      return source.get(day) ?? { day, billed: 0, toInvoice: 0, sellOut: 0, positives: 0, billedPositives: 0, toInvoicePositives: 0 }
    })
  }, [state.dailyMovement, daysInMonth])

  const startDay = Math.max(1, endDay - 6)
  const visible = allDays.slice(startDay - 1, endDay)
  const canBack = startDay > 1
  const canForward = endDay < naturalEnd

  const chart = useMemo(() => {
    const width = 760
    const height = 330
    const left = 62
    const right = 62
    const top = 36
    const bottom = 52
    const plotW = width - left - right
    const plotH = height - top - bottom
    const financialMax = Math.max(1, ...visible.map(item => Math.max(item.billed, item.toInvoice)))
    const positivesMax = Math.max(1, ...visible.map(item => effectivePositives(item)))
    const x = (index: number) => left + (visible.length <= 1 ? plotW / 2 : index * plotW / (visible.length - 1))
    const moneyY = (value: number) => top + plotH - value / financialMax * plotH
    const positiveY = (value: number) => top + plotH - value / positivesMax * plotH
    return {
      width, height, left, right, top, bottom, plotW, plotH, financialMax, positivesMax,
      billed: visible.map((item, index) => ({ x: x(index), y: moneyY(item.billed) })),
      pending: visible.map((item, index) => ({ x: x(index), y: moneyY(item.toInvoice) })),
      positives: visible.map((item, index) => ({ x: x(index), y: positiveY(effectivePositives(item)) })),
      x,
    }
  }, [visible])

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()

  function step(delta: number) {
    setEndDay(current => Math.max(minimumEnd, Math.min(naturalEnd, current + delta)))
  }

  return <div className="movement-modern-shell">
    <div className="movement-modern-toolbar">
      <div>
        <span>JANELA DE 7 DIAS</span>
        <strong>{String(startDay).padStart(2, '0')}–{String(endDay).padStart(2, '0')} {monthLabel}</strong>
      </div>
      <div className="movement-window-controls">
        <button onClick={() => step(-1)} disabled={!canBack} aria-label="Voltar um dia">‹</button>
        <button className="movement-today" onClick={() => setEndDay(Math.max(minimumEnd, naturalEnd))}>Hoje</button>
        <button onClick={() => step(1)} disabled={!canForward} aria-label="Avançar um dia">›</button>
      </div>
    </div>

    <div className="movement-modern-grid">
      <section className="movement-modern-chart-card">
        <div className="movement-card-heading">
          <div><span>PERFORMANCE</span><strong>Movimento dos últimos 7 dias</strong></div>
          <div className="movement-modern-legend">
            <span><i className="legend-line billed" />Faturado</span>
            <span><i className="legend-line pending" />A faturar</span>
            <span><i className="legend-line positives" />Pos. faturada</span>
          </div>
        </div>

        <div className="movement-svg-wrap">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Movimento diário de ${startDay} a ${endDay}`}>
            <defs>
              <linearGradient id="movementBilledArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3e79b9" stopOpacity=".30" />
                <stop offset="100%" stopColor="#3e79b9" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="movementPendingArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef3346" stopOpacity=".26" />
                <stop offset="100%" stopColor="#ef3346" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, .25, .5, .75, 1].map((ratio, index) => {
              const y = chart.top + chart.plotH * ratio
              const value = chart.financialMax * (1 - ratio)
              return <g key={ratio}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="movement-grid-line" />
                <text x={chart.left - 12} y={y + 4} textAnchor="end" className="movement-axis-label">{index === 4 ? '0' : compactMoney.format(value)}</text>
              </g>
            })}

            <text x={chart.width - chart.right + 13} y={chart.top + 4} className="movement-axis-label positive-axis">{integer.format(chart.positivesMax)}</text>
            <text x={chart.width - chart.right + 13} y={chart.top + chart.plotH + 4} className="movement-axis-label positive-axis">0</text>

            <path d={areaPath(chart.billed, chart.top + chart.plotH)} fill="url(#movementBilledArea)" />
            <path d={areaPath(chart.pending, chart.top + chart.plotH)} fill="url(#movementPendingArea)" />
            <path d={smoothPath(chart.billed)} className="movement-series billed" />
            <path d={smoothPath(chart.pending)} className="movement-series pending" />
            <path d={smoothPath(chart.positives)} className="movement-series positives" />

            {visible.map((item, index) => <g key={item.day}>
              <text x={chart.x(index)} y={chart.height - 18} textAnchor="middle" className="movement-day-label">{item.day}</text>
              <rect x={chart.x(index) - 35} y={chart.top} width="70" height={chart.plotH} fill="transparent">
                <title>{`${item.day}: Faturado ${money.format(item.billed)} • A faturar ${money.format(item.toInvoice)} • Sell Out ${money.format(item.sellOut)} • ${effectivePositives(item)} positivados faturados • +${pendingOnlyPositives(item)} somente a faturar`}</title>
              </rect>
            </g>)}
          </svg>
        </div>
      </section>

      <section className="movement-modern-table-card">
        <div className="movement-card-heading table-heading">
          <div><span>DETALHE</span><strong>Fechamento por dia</strong></div>
        </div>
        <div className="movement-seven-table">
          <table>
            <thead><tr><th>Dia</th><th>Sell Out</th><th>Faturado</th><th>Positivação</th></tr></thead>
            <tbody>{visible.map(item => <tr key={item.day}>
              <td><b>{String(item.day).padStart(2, '0')}</b><small>{monthLabel}</small></td>
              <td><strong>{money.format(item.sellOut)}</strong></td>
              <td><strong className="movement-billed-value">{money.format(item.billed)}</strong></td>
              <td><b className="movement-positive-number">{integer.format(effectivePositives(item))}</b><small>{pendingOnlyPositives(item) ? `+${integer.format(pendingOnlyPositives(item))} a fat.` : 'faturada'}</small></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>

    <input
      className="movement-range"
      type="range"
      min={minimumEnd}
      max={Math.max(minimumEnd, naturalEnd)}
      value={endDay}
      onChange={event => setEndDay(Number(event.target.value))}
      aria-label="Mover janela de sete dias"
    />
  </div>
}

export default function MovementModernOverlay() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [state, setState] = useState<StoredState | null>(() => readStoredState())

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      const nextTarget = document.querySelector<HTMLElement>('.movement-dashboard')
      if (nextTarget !== target) setTarget(nextTarget)
      const raw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (raw !== lastRaw) {
        lastRaw = raw
        setState(readStoredState())
      }
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(refresh, 700)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [target])

  useEffect(() => {
    if (!target) return
    target.classList.add('movement-modernized')
    return () => target.classList.remove('movement-modernized')
  }, [target])

  if (!target || !state?.uploads?.sales || !state.dailyMovement?.length) return null
  return createPortal(<MovementModern state={state} />, target)
}
