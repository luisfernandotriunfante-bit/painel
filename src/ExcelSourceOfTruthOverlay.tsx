import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildPanelMetrics, DEFAULT_LINE_TARGET_SHARES, EXCEL_LINE_NAMES, ExcelLineName } from './panelMetrics'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return { raw: raw ?? '', value: raw ? JSON.parse(raw) : {} }
  } catch {
    return { raw: '', value: {} }
  }
}

function parseNumber(raw: string) {
  const normalized = raw.trim().replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : 0
}

function activePage() {
  return String(document.documentElement.dataset.dashboardPage ?? 'resumo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function formatDate(raw: string) {
  if (!raw) return '—'
  const value = new Date(raw)
  return Number.isNaN(value.getTime()) ? '—' : value.toLocaleString('pt-BR')
}

function ValueCard({ label, value, note, tone = '' }: { label: string; value: string; note?: string; tone?: string }) {
  return <article className={`excel-truth-value ${tone}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>
}

function SectionTitle({ eyebrow, title, side }: { eyebrow: string; title: string; side?: string }) {
  return <div className="section-bar excel-truth-title"><div><span>{eyebrow}</span><h2>{title}</h2></div>{side && <div className="excel-truth-side">{side}</div>}</div>
}

function SummaryView({ metrics }: { metrics: any }) {
  const s = metrics.summary
  const p = metrics.positives
  return <>
    <section className="panel section-block excel-truth-panel">
      <SectionTitle eyebrow="BASE OFICIAL DO EXCEL" title="Ritmo do mês e comparativos" side={`${metrics.timing.workedDays}/${metrics.timing.targetDays} dias úteis`} />
      <div className="excel-truth-grid seven">
        <ValueCard label="META • VENDA MÉDIA DIÁRIA" value={money.format(s.dailyTarget)} note="Meta Sell Out ÷ dias úteis" tone="red" />
        <ValueCard label="VENDA MÉDIA DIÁRIA" value={money.format(s.currentDaily)} note={s.dailyTarget ? `${percent.format(s.currentDailyAchievement)} da média necessária` : '—'} />
        <ValueCard label="MÉDIA DIÁRIA NECESSÁRIA" value={money.format(s.neededDaily)} note={`${metrics.timing.remainingDays} dias úteis restantes`} />
        <ValueCard label="TENDÊNCIA FATURADO" value={money.format(s.billedTrend)} note={s.target ? `${percent.format(s.billedTrendAchievement)} da meta` : '—'} />
        <ValueCard label="TENDÊNCIA SELL OUT" value={money.format(s.sellOutTrend)} note={s.target ? `${percent.format(s.sellOutTrendAchievement)} da meta` : '—'} />
        <ValueCard label={`SELL OUT ${metrics.period.year - 1}`} value={s.previous ? money.format(s.previous) : '—'} note={s.variationTrendVsPrevious == null ? 'Histórico indisponível' : `${percent.format(s.variationTrendVsPrevious)} vs tendência faturada`} />
        <ValueCard label="SELL OUT MÉDIO • 3 MESES" value={s.average3 ? money.format(s.average3) : '—'} note={s.variationTrendVsAverage3 == null ? 'Histórico insuficiente' : `${percent.format(s.variationTrendVsAverage3)} vs tendência faturada`} />
      </div>
    </section>

    <section className="panel section-block excel-truth-panel">
      <SectionTitle eyebrow="POSITIVAÇÃO" title="Mesma apuração utilizada no arquivo diário" />
      <div className="excel-truth-grid four">
        <ValueCard label="META POSITIVAÇÃO" value={p.target ? integer.format(p.target) : '—'} tone="red" />
        <ValueCard label="POSITIVAÇÃO ATUAL" value={integer.format(p.current)} note={p.target ? percent.format(p.achievement) : '—'} />
        <ValueCard label="TENDÊNCIA POSITIVAÇÃO" value={integer.format(p.trend)} note={p.target ? percent.format(p.trendAchievement) : '—'} />
        <ValueCard label="MÉDIA POSITIVAÇÃO • 3 MESES" value={p.average3 ? integer.format(p.average3) : '—'} note={p.target && p.average3 ? percent.format(p.average3Achievement) : '—'} />
      </div>
    </section>

    <section className="panel section-block excel-truth-panel excel-line-panel">
      <SectionTitle eyebrow="LINHAS DE PRODUTO" title="Meta, faturado, tendência e verba do Excel" side={metrics.hasBilledLineDetail ? 'Faturado do 8022' : 'Detalhamento pendente'} />
      <div className="table-scroll excel-truth-table-wrap"><table className="excel-truth-table">
        <thead><tr><th>Linha</th><th>Part. meta</th><th>Meta</th><th>Faturado</th><th>% meta</th><th>Tendência fat.</th><th>Verba util.</th><th>% sobre real</th></tr></thead>
        <tbody>{metrics.lines.map((line: any) => <tr key={line.name}>
          <td><b>{line.name}</b></td><td>{percent.format(line.targetShare)}</td><td>{money.format(line.target)}</td>
          <td>{metrics.hasBilledLineDetail ? money.format(line.billed) : '—'}</td><td>{metrics.hasBilledLineDetail ? percent.format(line.achievement) : '—'}</td>
          <td>{metrics.hasBilledLineDetail ? money.format(line.billedTrend) : '—'}</td><td>{line.budgetUsed == null ? '—' : money.format(line.budgetUsed)}</td>
          <td>{line.budgetPctOfBilled == null ? '—' : percent.format(line.budgetPctOfBilled)}</td>
        </tr>)}</tbody>
      </table></div>
      {!metrics.budgetConfigured && <div className="excel-truth-note warn">A planilha oficial possui “Verba Util.” e “% Sobre Real”. A fonte automática equivalente ao antigo 12.303 ainda não existe no painel; por isso esses valores ficam claramente pendentes e podem ser informados em Configurações → Metas.</div>}
    </section>
  </>
}

function StockView({ metrics }: { metrics: any }) {
  const s = metrics.stock
  return <section className="panel section-block excel-truth-panel">
    <SectionTitle eyebrow="COBERTURA DO EXCEL" title="Estoque a preço de venda e a custo" side={`Meta ${decimal.format(s.coverageTargetDays)} dias`} />
    <div className="excel-stock-columns">
      <div className="excel-stock-column"><h3>PREÇO DE VENDA</h3>
        <ValueCard label="ESTOQUE ATUAL" value={s.positionSale ? money.format(s.positionSale) : '—'} />
        <ValueCard label="COBERTURA" value={s.dailyBase ? `${decimal.format(s.saleCoverage)} dias` : '—'} note={s.dailyBase ? `${decimal.format(s.saleCoverageGap)} dias para a referência` : 'Média histórica necessária'} />
        <ValueCard label="CARTEIRA CONVERTIDA P/ VENDA" value={s.transitSale ? money.format(s.transitSale) : '—'} note={`Markup ${percent.format(s.markup)}`} />
        <ValueCard label="ESTOQUE + CARTEIRA" value={s.totalSale ? money.format(s.totalSale) : '—'} note={s.dailyBase ? `${decimal.format(s.totalSaleCoverage)} dias de cobertura` : '—'} />
      </div>
      <div className="excel-stock-column"><h3>PREÇO DE CUSTO</h3>
        <ValueCard label="ESTOQUE ATUAL" value={s.positionCost ? money.format(s.positionCost) : '—'} />
        <ValueCard label="COBERTURA" value={s.dailyBase ? `${decimal.format(s.costCoverage)} dias` : '—'} note={s.dailyBase ? `${decimal.format(s.costCoverageGap)} dias para a referência` : 'Média histórica necessária'} />
        <ValueCard label="CARTEIRA / SALDO PEDIDO" value={s.transitCost ? money.format(s.transitCost) : '—'} />
        <ValueCard label="ESTOQUE + CARTEIRA" value={s.totalCost ? money.format(s.totalCost) : '—'} note={s.dailyBase ? `${decimal.format(s.totalCostCoverage)} dias de cobertura` : '—'} />
      </div>
    </div>
    <div className="excel-truth-note">O markup usado na planilha agora é o mesmo exibido aqui, calculado pela relação entre a posição atual a preço de venda e a preço de custo. O Excel não depende mais de um percentual escondido dentro do modelo.</div>
  </section>
}

function TeamView({ metrics }: { metrics: any }) {
  return <section className="panel section-block excel-truth-panel excel-team-full">
    <SectionTitle eyebrow="EQUIPES • BASE OFICIAL DO EXCEL" title="Apuração completa por RCA" side={`${metrics.team.length} RCAs`} />
    <div className="table-scroll excel-wide-table"><table className="excel-truth-table">
      <thead><tr><th>Coord.</th><th>Nome coord.</th><th>RCA</th><th>Vendedor</th><th>Meta</th><th>Faturado</th><th>% Fat.</th><th>A faturar</th><th>Real. + A fat.</th><th>% total</th><th>Ideal hoje</th><th>Dif. ideal</th><th>Falta meta</th><th>Meta pos.</th><th>Pos. fat.</th><th>% pos.</th><th>Pos. a fat.</th><th>Pos. total</th><th>% pos total</th><th>Ideal pos.</th><th>Dif. pos.</th><th>Falta pos.</th><th>Target/dia</th></tr></thead>
      <tbody>{metrics.team.map((row: any) => <tr key={row.code}>
        <td>{row.coordinatorCode || '—'}</td><td>{row.coordinatorName || '—'}</td><td><b>{row.code}</b></td><td>{row.name}</td>
        <td>{money.format(row.target)}</td><td>{money.format(row.billed)}</td><td>{row.target ? percent.format(row.billedAchievement) : '—'}</td>
        <td>{money.format(row.toInvoice)}</td><td><strong>{money.format(row.total)}</strong></td><td>{row.target ? percent.format(row.totalAchievement) : '—'}</td>
        <td>{row.ideal == null ? '—' : money.format(row.ideal)}</td><td>{row.idealGap == null ? '—' : money.format(row.idealGap)}</td><td>{money.format(row.targetGap)}</td>
        <td>{integer.format(row.positiveTarget)}</td><td>{integer.format(row.billedPositives)}</td><td>{row.positiveTarget ? percent.format(row.billedPositiveAchievement) : '—'}</td>
        <td>{integer.format(row.toInvoicePositives)}</td><td><strong>{integer.format(row.totalPositives)}</strong></td><td>{row.positiveTarget ? percent.format(row.totalPositiveAchievement) : '—'}</td>
        <td>{row.idealPositives == null ? '—' : decimal.format(row.idealPositives)}</td><td>{row.idealPositiveGap == null ? '—' : decimal.format(row.idealPositiveGap)}</td>
        <td>{decimal.format(row.positiveGap)}</td><td>{row.positiveTargetPerDay == null ? '—' : decimal.format(row.positiveTargetPerDay)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

function NetworkView({ metrics }: { metrics: any }) {
  return <section className="panel section-block excel-truth-panel excel-network-official">
    <SectionTitle eyebrow="TOP 5 REDES • BASE DO EXCEL" title="Faturado, Sell Out e tendências" side={`${metrics.networks.length}/5 redes`} />
    <div className="table-scroll"><table className="excel-truth-table">
      <thead><tr><th>Rede</th><th>CNPJs</th><th>Meta</th><th>2025</th><th>Faturado</th><th>% fat.</th><th>Tend. fat.</th><th>A faturar</th><th>Sell Out</th><th>% total</th><th>Tend. Sell Out</th></tr></thead>
      <tbody>{metrics.networks.map((row: any) => <tr key={row.name}><td><b>{row.name}</b></td><td>{integer.format(row.customers)}</td><td>{money.format(row.target)}</td><td>{row.previous ? money.format(row.previous) : '—'}</td><td>{money.format(row.billed)}</td><td>{row.target ? percent.format(row.billedAchievement) : '—'}</td><td>{money.format(row.billedTrend)}</td><td>{money.format(row.toInvoice)}</td><td><strong>{money.format(row.sellOut)}</strong></td><td>{row.target ? percent.format(row.sellOutAchievement) : '—'}</td><td>{money.format(row.sellOutTrend)}</td></tr>)}</tbody>
    </table></div>
    <div className="excel-truth-note">O modelo oficial possui cinco blocos de rede. O painel completo pode ter mais redes; este quadro mostra exatamente as cinco primeiras redes configuradas que alimentam o Excel.</div>
  </section>
}

function AuditView({ metrics }: { metrics: any }) {
  const r = metrics.reconciliation
  return <>
    <section className="panel section-block excel-truth-panel">
      <SectionTitle eyebrow="AUDITORIA EXCEL DO DIA" title={metrics.readiness.complete ? 'Todos os blocos estão alimentados' : `${metrics.readiness.pendingCount} bloco(s) ainda precisam de informação`} side={metrics.readiness.complete ? 'PRONTO' : 'PENDÊNCIAS'} />
      <div className="excel-check-list">{metrics.checks.map((check: any) => <div key={check.block} className={check.ok ? 'ok' : 'pending'}><i>{check.ok ? '✓' : '!'}</i><span><b>{check.block}</b><small>{check.detail}</small></span></div>)}</div>
    </section>

    <section className="panel section-block excel-truth-panel">
      <SectionTitle eyebrow="CONFERÊNCIA DAS LEITURAS" title="Movimento diário x consolidado" />
      <div className="excel-truth-grid four">
        <ValueCard label="SELL OUT • MOVIMENTO DIÁRIO" value={money.format(r.dailySellOut)} note={`Δ consolidado ${money.format(r.sellOutDelta)}`} />
        <ValueCard label="FATURADO • MOVIMENTO DIÁRIO" value={money.format(r.dailyBilled)} note={`Δ consolidado ${money.format(r.billedDelta)}`} />
        <ValueCard label="A FATURAR • MOVIMENTO DIÁRIO" value={money.format(r.dailyToInvoice)} note={`Consolidado ${money.format(r.consolidatedToInvoice)}`} />
        <ValueCard label="SOMA POSITIVAÇÕES DIÁRIAS" value={integer.format(r.dailyPositives)} note={`Positivação mensal única ${integer.format(r.consolidatedPositives)}`} />
      </div>
    </section>

    <section className="panel section-block excel-truth-panel">
      <SectionTitle eyebrow="FONTES" title="Bases que alimentam o arquivo diário" />
      <div className="excel-source-grid">{metrics.sources.map((source: any) => <div key={source.key} className={source.loaded ? 'loaded' : 'missing'}><i>{source.loaded ? '✓' : '!'}</i><span><b>{source.label}</b><small>{source.loaded ? `Atualizada em ${formatDate(source.updatedAt)}` : 'Base não carregada'}</small></span></div>)}</div>
    </section>
  </>
}

function ConfigView({ state, metrics }: { state: any; metrics: any }) {
  const [shares, setShares] = useState<Record<ExcelLineName, string>>(() => Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, String((metrics.lines.find((row: any) => row.name === name)?.targetShare ?? DEFAULT_LINE_TARGET_SHARES[name]) * 100).replace('.', ',')])) as Record<ExcelLineName, string>)
  const [budget, setBudget] = useState<Record<ExcelLineName, string>>(() => Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, String(state.lineBudgetUsed?.[name] ?? 0).replace('.', ',')])) as Record<ExcelLineName, string>)
  const [coverage, setCoverage] = useState(String(metrics.stock.coverageTargetDays).replace('.', ','))
  const [message, setMessage] = useState('')

  useEffect(() => {
    setShares(Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, String((metrics.lines.find((row: any) => row.name === name)?.targetShare ?? DEFAULT_LINE_TARGET_SHARES[name]) * 100).replace('.', ',')])) as Record<ExcelLineName, string>)
    setBudget(Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, String(state.lineBudgetUsed?.[name] ?? 0).replace('.', ',')])) as Record<ExcelLineName, string>)
    setCoverage(String(metrics.stock.coverageTargetDays).replace('.', ','))
  }, [state.lineTargetShares, state.lineBudgetUsed, state.excelCoverageTargetDays])

  function save() {
    const parsedShares = Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, parseNumber(shares[name]) / 100])) as Record<ExcelLineName, number>
    const total = EXCEL_LINE_NAMES.reduce((sum, name) => sum + parsedShares[name], 0)
    if (Math.abs(total - 1) > 0.0001) {
      setMessage(`A participação das cinco linhas precisa somar 100%. Hoje soma ${decimal.format(total * 100)}%.`)
      return
    }
    const coverageValue = parseNumber(coverage)
    if (coverageValue <= 0) {
      setMessage('A referência de cobertura precisa ser maior que zero.')
      return
    }
    const parsedBudget = Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, parseNumber(budget[name])])) as Record<ExcelLineName, number>
    const current = readState().value
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      lineTargetShares: parsedShares,
      lineBudgetUsed: parsedBudget,
      lineBudgetUsedConfigured: true,
      excelCoverageTargetDays: coverageValue,
    }))
    setMessage('Parâmetros salvos. Atualizando o painel...')
    window.setTimeout(() => window.location.reload(), 250)
  }

  return <section className="panel section-block excel-truth-panel excel-params-panel">
    <SectionTitle eyebrow="PARÂMETROS DO EXCEL" title="Tudo que antes ficava escondido no modelo" side={`${metrics.timing.targetDays} dias úteis`} />
    <div className="excel-param-summary"><div><span>DIAS ÚTEIS</span><strong>{metrics.timing.targetDays}</strong><small>Usa o valor configurado nesta aba; na ausência, calendário oficial.</small></div><div><span>COBERTURA REFERÊNCIA</span><input value={coverage} onChange={event => setCoverage(event.target.value)} /><small>Dias usados nos blocos de estoque.</small></div></div>
    <div className="excel-param-table"><table className="excel-truth-table"><thead><tr><th>Linha</th><th>Participação da meta</th><th>Meta calculada</th><th>Verba utilizada</th></tr></thead><tbody>{EXCEL_LINE_NAMES.map(name => {
      const line = metrics.lines.find((row: any) => row.name === name)
      return <tr key={name}><td><b>{name}</b></td><td><input value={shares[name]} onChange={event => setShares(current => ({ ...current, [name]: event.target.value }))} /><em>%</em></td><td>{money.format(line?.target ?? 0)}</td><td><input value={budget[name]} onChange={event => setBudget(current => ({ ...current, [name]: event.target.value }))} /></td></tr>
    })}</tbody></table></div>
    <div className="excel-param-actions"><button onClick={save}>Salvar parâmetros do Excel</button><span>{message || 'A verba utilizada era lida do antigo relatório 12.303. Enquanto não definirmos uma nova fonte automática, ela pode ser informada aqui e passa a alimentar painel e Excel.'}</span></div>
  </section>
}

export default function ExcelSourceOfTruthOverlay() {
  const initial = readState()
  const [stateRaw, setStateRaw] = useState(initial.raw)
  const [state, setState] = useState<any>(initial.value)
  const [page, setPage] = useState(activePage())
  const [target, setTarget] = useState<Element | null>(null)

  useEffect(() => {
    const sync = () => {
      const next = readState()
      if (next.raw !== stateRaw) {
        setStateRaw(next.raw)
        setState(next.value)
      }
      const nextPage = activePage()
      setPage(nextPage)
      if (nextPage === 'equipe' || nextPage === 'redes') setTarget(document.querySelector('.top-network-data-page'))
      else setTarget(document.querySelector('main.v3-main'))
    }
    sync()
    const timer = window.setInterval(sync, 700)
    return () => window.clearInterval(timer)
  }, [stateRaw])

  const metrics = useMemo(() => buildPanelMetrics(state), [state])
  if (!target) return null

  let content = null
  if (page === 'resumo') content = <SummaryView metrics={metrics} />
  else if (page === 'estoque') content = <StockView metrics={metrics} />
  else if (page === 'gerencial') content = <TeamView metrics={metrics} />
  else if (page === 'equipe' || page === 'redes') content = <NetworkView metrics={metrics} />
  else if (page === 'conferencia' || page === 'conferência') content = <AuditView metrics={metrics} />
  else if (page === 'metas') content = <ConfigView state={state} metrics={metrics} />

  return content ? createPortal(<div className="excel-source-of-truth">{content}</div>, target) : null
}
