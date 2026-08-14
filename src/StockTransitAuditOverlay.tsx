import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

type StoredState = {
  positionCost?: number
  positionSale?: number
  stockTransit?: number
  uploads?: { position?: unknown; transit?: unknown }
}

function readState(): StoredState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function StockTransitAuditOverlay() {
  const [state, setState] = useState<StoredState>(() => readState())
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      setTarget(document.querySelector<HTMLElement>('.conference-grid'))
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

  if (!target || (!state.uploads?.position && !state.uploads?.transit)) return null

  const physicalCost = Math.max(0, Number(state.positionCost) || 0)
  const physicalSale = Math.max(0, Number(state.positionSale) || 0)
  const transitCost = Math.max(0, Number(state.stockTransit) || 0)
  const costWithTransit = physicalCost + transitCost

  return createPortal(
    <section className="panel section-block stock-transit-audit-panel">
      <div className="section-bar">
        <div><span>AUDITORIA DE ESTOQUE &amp; TRÂNSITO</span><h2>Base financeira usada no painel e no Excel</h2></div>
        <div className="status-pill ok">Sem conversão estimada</div>
      </div>
      <div className="stock-transit-audit-grid">
        <article>
          <span>ESTOQUE FÍSICO • CUSTO</span>
          <strong>{state.uploads?.position ? money.format(physicalCost) : '—'}</strong>
          <small>Relatório 105</small>
        </article>
        <article>
          <span>CARTEIRA / TRÂNSITO • CUSTO</span>
          <strong>{state.uploads?.transit ? money.format(transitCost) : '—'}</strong>
          <small>Net Value (ZINV), somado linha a linha</small>
        </article>
        <article className="ok">
          <span>POSIÇÃO AO CUSTO + TRÂNSITO</span>
          <strong>{state.uploads?.position ? money.format(costWithTransit) : '—'}</strong>
          <small>105 ao custo + Carteira/ZINV</small>
        </article>
        <article>
          <span>ESTOQUE FÍSICO • PREÇO DE VENDA</span>
          <strong>{state.uploads?.position ? money.format(physicalSale) : '—'}</strong>
          <small>Preço de venda do relatório 105</small>
        </article>
        <article className="neutral">
          <span>TRÂNSITO • PREÇO DE VENDA</span>
          <strong>Não calculado</strong>
          <small>Sem fonte oficial. O sistema não aplica proporção, markup ou estimativa.</small>
        </article>
      </div>
      <div className="stock-transit-audit-note">
        No Excel, o trânsito é gravado somente no bloco de custo. O bloco a preço de venda permanece baseado exclusivamente no estoque físico do 105 até existir uma fonte oficial para valorar a Carteira a preço de venda.
      </div>
    </section>,
    target,
  )
}
