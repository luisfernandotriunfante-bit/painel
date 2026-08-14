import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildProductCodeBridgeFromFile, readProductCodeBridgeDiagnostics } from './productCodeBridge'
import { readTransitDiagnostic, readTransitValueByCode, valueTransitAtSale } from './transitValuation'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

type Finance = { cost?: number; sale?: number }
type PositionItem = { code?: string; description?: string; costUnit?: number; saleUnit?: number }

type StoredState = {
  positionCost?: number
  positionSale?: number
  stockTransit?: number
  positionFinanceByCode?: Record<string, Finance>
  positionItems?: PositionItem[]
  uploads?: { position?: unknown; transit?: unknown; catalog?: unknown }
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
  const [, setBridgeVersion] = useState(0)

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

  useEffect(() => {
    const handleFile = (event: Event) => {
      const input = event.target as HTMLInputElement | null
      if (!input || input.type !== 'file') return
      const file = input.files?.[0]
      if (!file) return
      const nearbyText = input.closest('label, article, section, div')?.textContent ?? ''
      const looksLike286 = /286/.test(file.name) || /286/.test(nearbyText)
      if (!looksLike286) return
      void buildProductCodeBridgeFromFile(file).then(() => {
        setBridgeVersion(version => version + 1)
        setState(readState())
      }).catch(() => {
        setBridgeVersion(version => version + 1)
      })
    }
    document.addEventListener('change', handleFile, true)
    return () => document.removeEventListener('change', handleFile, true)
  }, [])

  if (!target || (!state.uploads?.position && !state.uploads?.transit)) return null

  const physicalCost = Math.max(0, Number(state.positionCost) || 0)
  const physicalSale = Math.max(0, Number(state.positionSale) || 0)
  const transitCost = Math.max(0, Number(state.stockTransit) || 0)
  const costWithTransit = physicalCost + transitCost
  const valueByCode = readTransitValueByCode()
  const diagnostic = readTransitDiagnostic()
  const bridgeDiagnostic = readProductCodeBridgeDiagnostics()
  const valuation = valueTransitAtSale(valueByCode, state.positionFinanceByCode ?? {}, state.positionItems ?? [])
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
          <small>Estoque físico a P. Venda + Carteira valorada produto a produto</small>
        </article>
      </div>
      <div className="stock-transit-match-summary">
        <span>Código direto: <b>{valuation.directSkus}</b></span>
        <span>De/para de cadastro: <b>{valuation.bridgedSkus}</b></span>
        <span>Descrição única: <b>{valuation.descriptionSkus}</b></span>
        <span>Sem correspondência: <b>{valuation.unmappedSkus.length}</b></span>
      </div>
      {!complete && <div className="stock-transit-diagnostic">
        <strong>DIAGNÓSTICO DO CRUZAMENTO</strong>
        <span>Coluna de material da Carteira: <b>{diagnostic?.materialHeader || 'recarregue a Carteira'}</b></span>
        <span>SKUs identificados na Carteira: <b>{diagnostic?.identifiedSkus ?? Object.keys(valueByCode).length}</b></span>
        <span>Valor da Carteira com SKU identificado: <b>{money.format(diagnostic?.codedValue ?? Object.values(valueByCode).reduce((sum, value) => sum + Number(value || 0), 0))}</b></span>
        {(diagnostic?.sampleTransitCodes?.length ?? 0) > 0 && <span>Exemplos Carteira: <b>{diagnostic!.sampleTransitCodes.join(', ')}</b></span>}
        {sample105.length > 0 && <span>Exemplos 105: <b>{sample105.join(', ')}</b></span>}
      </div>}
      {!complete && <div className="stock-transit-diagnostic stock-transit-bridge-diagnostic">
        <strong>DE/PARA DO CADASTRO 286</strong>
        <span>Arquivo lido: <b>{bridgeDiagnostic?.source || 'recarregue o cadastro 286'}</b></span>
        <span>Código principal: <b>{bridgeDiagnostic?.canonicalColumn || '—'}</b></span>
        <span>Colunas de código encontradas: <b>{bridgeDiagnostic?.codeColumns?.join(' • ') || '—'}</b></span>
        <span>Aliases únicos aproveitáveis: <b>{bridgeDiagnostic?.aliases ?? 0}</b></span>
        <span>Aliases ambíguos descartados: <b>{bridgeDiagnostic?.ambiguousAliases ?? 0}</b></span>
        {(bridgeDiagnostic?.examples?.length ?? 0) > 0 && <span>Exemplos de de/para: <b>{bridgeDiagnostic!.examples.join(', ')}</b></span>}
      </div>}
      <div className="stock-transit-audit-note">
        O cruzamento tenta primeiro o código direto, depois um de/para de cadastro e, por último, descrição normalizada com correspondência única entre Carteira e 105. Nenhuma correspondência aproximada é aceita. O Excel só recebe o trânsito a preço de venda quando 100% do ZINV estiver cruzado.
        {!complete && valuation.unmappedSkus.length > 0 ? ` SKUs ainda sem correspondência: ${valuation.unmappedSkus.slice(0, 12).join(', ')}${valuation.unmappedSkus.length > 12 ? '…' : ''}.` : ''}
      </div>
    </section>,
    target,
  )
}
