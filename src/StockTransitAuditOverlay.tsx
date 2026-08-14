import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { readTransitDiagnostic, readTransitValueByCode, valueTransitAtSale } from './transitValuation'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

type Finance = { cost?: number; sale?: number }

type StoredState = {
  positionCost?: number
  positionSale?: number
  stockTransit?: number
  positionFinanceByCode?: Record<string, Finance>
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
  const valueByCode = readTransitValueByCode()
  const diagnostic = readTransitDiagnostic()
  const valuation = valueTransitAtSale(valueByCode, state.positionFinanceByCode ?? {})
  const mappedPct = transitCost > 0 ? Math.min(1, valuation.mappedCost / transitCost) : 0
  const complete = transitCost > 0 && valuation.mappedCost >= transitCost - 0.01 && valuation.unmappedCost <= 0.01
  const saleWithTransit = physicalSale + (complete ? valuation.saleValue : 0)
  const sample105 = Object.keys(state.positionFinanceByCode ?? {}).slice(0, 8)
  const parserFoundCodes = (diagnostic?.identifiedSkus ?? Object.keys(valueByCode).length) > 0

  return createPortal(
    <section className="panel section-block stock-transit-audit-panel">
      <div className="section-bar">
        <div><span>AUDITORIA DE ESTOQUE &amp; TRÂNSITO</span><h2>Base financeira usada no painel e no Excel</h2></div>
        <div className={`status-pill ${complete ? 'ok' : 'warn'}`}>{complete ? '100% cruzado no 105' : parserFoundCodes ? 'Revisar SKUs sem correspondência' : 'SKU da Carteira não identificado'}</div>
      </div>
      <div className="stock-transit-audit-grid">
        <article>
          <span>ESTOQUE FÍSICO • CUSTO</span>
          <strong>{state.uploads?.position ? money.format(physicalCost) : '—'}</strong>
          <small>Relatório 105 • coluna Real</small>
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
          <small>Relatório 105 • coluna P. Venda</small>
        </article>
        <article className={complete ? 'ok' : 'warn'}>
          <span>TRÂNSITO • PREÇO DE VENDA</span>
          <strong>{complete ? money.format(valuation.saleValue) : 'Aguardando cruzamento completo'}</strong>
          <small>{state.uploads?.transit && state.uploads?.position ? `${percent.format(mappedPct)} do ZINV encontrou Real/P. Venda no 105` : 'Carregue 105 e Carteira'}</small>
        </article>
        <article className={complete ? 'ok' : 'neutral'}>
          <span>POSIÇÃO VENDA + TRÂNSITO</span>
          <strong>{complete ? money.format(saleWithTransit) : '—'}</strong>
          <small>Estoque físico a P. Venda + Carteira valorada SKU a SKU</small>
        </article>
      </div>
      {!complete && <div className="stock-transit-diagnostic">
        <strong>DIAGNÓSTICO DO CRUZAMENTO</strong>
        <span>Coluna de material da Carteira: <b>{diagnostic?.materialHeader || 'recarregue a Carteira'}</b></span>
        <span>SKUs identificados na Carteira: <b>{diagnostic?.identifiedSkus ?? Object.keys(valueByCode).length}</b></span>
        <span>Valor da Carteira com SKU identificado: <b>{money.format(diagnostic?.codedValue ?? Object.values(valueByCode).reduce((sum, value) => sum + Number(value || 0), 0))}</b></span>
        {(diagnostic?.sampleTransitCodes?.length ?? 0) > 0 && <span>Exemplos Carteira: <b>{diagnostic!.sampleTransitCodes.join(', ')}</b></span>}
        {sample105.length > 0 && <span>Exemplos 105: <b>{sample105.join(', ')}</b></span>}
      </div>}
      <div className="stock-transit-audit-note">
        A valoração do trânsito não usa markup global. Para cada SKU da Carteira, o sistema aplica ao Net Value (ZINV) a relação Real → P. Venda do mesmo SKU no relatório 105. O Excel só recebe o trânsito a preço de venda quando 100% do valor da Carteira estiver cruzado.
        {!complete && valuation.unmappedSkus.length > 0 ? ` SKUs sem preço completo no 105: ${valuation.unmappedSkus.slice(0, 12).join(', ')}${valuation.unmappedSkus.length > 12 ? '…' : ''}.` : ''}
      </div>
    </section>,
    target,
  )
}
