import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const RETURN_PAGE_KEY = 'painel-sell-out-milenio:return-page'

type StoredState = {
  sellOutPositiveTarget?: number
  potentialPositives?: number
}

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

function readState(): StoredState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function SellOutPositiveTargetOverlay() {
  const [targetGrid, setTargetGrid] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(() => Number(readState().sellOutPositiveTarget) || 0)
  const [draft, setDraft] = useState(() => String(Number(readState().sellOutPositiveTarget) || 0))

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      setTargetGrid(document.querySelector<HTMLElement>('.target-control-grid-v3'))
      setVisible(document.documentElement.dataset.dashboardPage === 'metas')
      const raw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (raw !== lastRaw) {
        lastRaw = raw
        const next = Number(readState().sellOutPositiveTarget) || 0
        setValue(next)
        setDraft(String(next))
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 500)
    return () => window.clearInterval(timer)
  }, [])

  function save() {
    const parsed = Math.max(0, Math.round(Number(draft.replace(/\D/g, '')) || 0))
    const current = readState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, sellOutPositiveTarget: parsed }))
    sessionStorage.setItem(RETURN_PAGE_KEY, 'metas')
    setValue(parsed)
    setDraft(String(parsed))
    window.location.reload()
  }

  if (!visible || !targetGrid) return null

  const state = readState()
  const attainment = value > 0 ? (Number(state.potentialPositives) || 0) / value : 0

  return createPortal(
    <article className="target-control primary sellout-positive-target-control">
      <span>META POSITIVAÇÃO SELL OUT • T&amp;C</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="number-input"
          type="number"
          min="0"
          step="1"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') save() }}
          aria-label="Meta de positivação Sell Out"
        />
        <button type="button" className="lock-button" onClick={save}>Salvar</button>
      </div>
      <small>{value > 0 ? `${integer.format(value)} clientes • ${percent.format(attainment)} atingido` : 'Definição manual e independente da Bússola'}</small>
    </article>,
    targetGrid,
  )
}
