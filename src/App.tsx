import { ChangeEvent, useMemo, useState } from 'react'

type Page = 'resumo' | 'gerencial' | 'equipe' | 'estoque' | 'conferencia' | 'upload'

type Network = { name: string; target: number; sellOut: number; previous: number }
type Seller = { code: string; name: string; target: number; sellOut: number; positives: number; positiveTarget: number }
type StockLine = { name: string; cost: number; sale: number; transit: number; rule: string }
type UploadInfo = { name: string; size: number; updatedAt: string } | null

type AppState = {
  sellOut: number
  billed: number
  toInvoice: number
  potentialPositives: number
  stockCost: number
  stockSale: number
  stockTransit: number
  sellOutTarget: number
  industryTarget: number
  industryPositiveTarget: number
  networks: Network[]
  sellers: Seller[]
  stockLines: StockLine[]
  daily: number[]
  uploads: Record<string, UploadInfo>
}

const STORAGE_KEY = 'painel-sell-out-milenio:v1'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

const today = new Date()
const monthDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

const dailySeed = Array.from({ length: monthDays }, (_, index) => {
  const samples = [182400, 224890, 196320, 0, 0, 281950, 307840, 247650, 265440, 312730, 298510, 326820]
  return index < samples.length ? samples[index] : 0
})

const defaultState: AppState = {
  sellOut: 3742680.45,
  billed: 3512300.1,
  toInvoice: 230380.35,
  potentialPositives: 312,
  stockCost: 1824940.72,
  stockSale: 2341508.66,
  stockTransit: 418400,
  sellOutTarget: 5000000,
  industryTarget: 5000000,
  industryPositiveTarget: 950,
  networks: [
    { name: 'ABV', target: 950000, sellOut: 781420, previous: 726800 },
    { name: 'MEGA', target: 740000, sellOut: 608900, previous: 590100 },
    { name: 'PIRES', target: 620000, sellOut: 487640, previous: 462300 },
    { name: 'NOVA ESTRELA', target: 520000, sellOut: 401880, previous: 389600 },
    { name: 'PORTAL / PRINCESA', target: 410000, sellOut: 327440, previous: 301900 },
  ],
  sellers: [
    { code: '910', name: 'Jonatas MCD', target: 860000, sellOut: 691420, positives: 142, positiveTarget: 170 },
    { code: '701', name: 'Equipe 701', target: 780000, sellOut: 608260, positives: 126, positiveTarget: 155 },
    { code: '702', name: 'Equipe 702', target: 760000, sellOut: 574980, positives: 119, positiveTarget: 150 },
    { code: '703', name: 'Equipe 703', target: 720000, sellOut: 542130, positives: 111, positiveTarget: 145 },
    { code: '704', name: 'Equipe 704', target: 690000, sellOut: 497810, positives: 104, positiveTarget: 140 },
    { code: '705', name: 'Equipe 705', target: 620000, sellOut: 451280, positives: 96, positiveTarget: 130 },
  ],
  stockLines: [
    { name: 'Creme Dental', cost: 578420.1, sale: 741870.3, transit: 126000, rule: 'A validar no cadastro 286' },
    { name: 'Sabonetes', cost: 337800.75, sale: 432910.4, transit: 84000, rule: 'A validar no cadastro 286' },
    { name: 'Hair', cost: 258340.62, sale: 331120.6, transit: 57600, rule: 'A validar no cadastro 286' },
    { name: 'Esc + Enx + Fio', cost: 224790.2, sale: 288210.3, transit: 50400, rule: 'A validar no cadastro 286' },
    { name: 'Limpeza', cost: 198440.55, sale: 254390.4, transit: 42600, rule: 'A validar no cadastro 286' },
    { name: 'Outros', cost: 227148.5, sale: 292?996.66, transit: 57800, rule: 'A validar no cadastro 286' },
  ],
  daily: dailySeed,
  uploads: {
    sales: null,
    stock: null,
    targets: null,
    cost: null,
    transit: null,
    history: null,
  },
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const saved = JSON.parse(raw) as Partial<AppState>
    return { ...defaultState, ...saved }
  } catch {
    return defaultState
  }
}

function parseMoneyInput(value: string) {
  const cleaned = value.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function CurrencyField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <input
      className="currency-input"
      value={editing ? draft : money.format(value)}
      onFocus={() => { setEditing(true); setDraft(value.toFixed(2).replace('.', ',')) }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { onChange(parseMoneyInput(draft)); setEditing(false) }}
    />
  )
}

function App() {
  const [page, setPage] = useState<Page>('resumo')
  const [state, setState] = useState<AppState>(loadInitialState)

  const setPersistedState = (updater: AppState | ((current: AppState) => AppState)) => {
    setState(current => {
      const next = typeof updater === 'function' ? updater(current) : updater
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const totalNetworkTarget = useMemo(() => state.networks.reduce((sum, item) => sum + item.target, 0), [state.networks])
  const totalNetworkSellOut = useMemo(() => state.networks.reduce((sum, item) => sum + item.sellOut, 0), [state.networks])

  const updateSellOutTarget = (value: number) => setPersistedState(current => ({ ...current, sellOutTarget: value }))

  const updateNetworkPool = (value: number) => {
    setPersistedState(current => {
      const old = current.networks.reduce((sum, item) => sum + item.target, 0)
      if (old <= 0) return current
      return { ...current, networks: current.networks.map(item => ({ ...item, target: item.target * value / old })) }
    })
  }

  const updateNetworkTarget = (index: number, requested: number) => {
    setPersistedState(current => {
      const networks = current.networks.map(item => ({ ...item }))
      const total = networks.reduce((sum, item) => sum + item.target, 0)
      const oldValue = networks[index].target
      const newValue = Math.max(0, Math.min(total, requested))
      const othersTotal = total - oldValue
      networks[index].target = newValue
      if (othersTotal > 0) {
        const remaining = total - newValue
        networks.forEach((item, itemIndex) => {
          if (itemIndex !== index) item.target = item.target / othersTotal * remaining
        })
      }
      return { ...current, networks }
    })
  }

  const handleUpload = (key: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPersistedState(current => ({
      ...current,
      uploads: {
        ...current.uploads,
        [key]: { name: file.name, size: file.size, updatedAt: new Date().toISOString() },
      },
    }))
  }

  const resetLocal = () => {
    if (!window.confirm('Apagar a base local e voltar ao estado de demonstração?')) return
    localStorage.removeItem(STORAGE_KEY)
    setState(defaultState)
  }

  const monthName = today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow light">MILÊNIO • INTELIGÊNCIA COMERCIAL</div>
          <h1>Painel Sell Out</h1>
        </div>
        <div className="topbar-meta">
          <span className="status-dot" /> Base local ativa
          <strong>{monthName}</strong>
        </div>
      </header>

      <nav className="nav-tabs">
        {[
          ['resumo', 'Resumo'], ['gerencial', 'Gerencial'], ['equipe', 'Equipe'], ['estoque', 'Estoque'], ['conferencia', 'Conferência'], ['upload', 'Upload de dados'],
        ].map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key as Page)}>{label}</button>
        ))}
      </nav>

      <main>
        {page === 'resumo' && <Resumo state={state} monthName={monthName} onTarget={updateSellOutTarget} />}
        {page === 'gerencial' && <Gerencial state={state} totalTarget={totalNetworkTarget} totalSellOut={totalNetworkSellOut} onNetworkTarget={updateNetworkTarget} onNetworkPool={updateNetworkPool} onSellOutTarget={updateSellOutTarget} />}
        {page === 'equipe' && <Equipe state={state} onSellOutTarget={updateSellOutTarget} />}
        {page === 'estoque' && <Estoque state={state} />}
        {page === 'conferencia' && <Conferencia state={state} />}
        {page === 'upload' && <Upload state={state} onUpload={handleUpload} onReset={resetLocal} />}
      </main>
    </div>
  )
}

function MetricCard({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'red' | 'navy' | 'green' }) {
  return <div className={`metric-card ${tone}`}><div className="eyebrow">{label}</div><div className="metric-value">{value}</div>{hint && <div className="metric-hint">{hint}</div>}</div>
}

function SectionTitle({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return <div className="section-title"><div className="eyebrow red-text">{kicker}</div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
}

function TargetFooter({ state, onTarget }: { state: AppState; onTarget: (value: number) => void }) {
  const achievement = state.sellOutTarget > 0 ? state.sellOut / state.sellOutTarget : 0
  return (
    <section className="target-footer">
      <div>
        <div className="eyebrow light">META SELL OUT • T&C</div>
        <h3>Referência gerencial do mês</h3>
        <p>Meta definida manualmente. Ela é independente das metas individuais dos vendedores importadas da Bússola.</p>
      </div>
      <div className="target-edit"><span>Meta do mês</span><CurrencyField value={state.sellOutTarget} onChange={onTarget} /></div>
      <div className="target-progress"><strong>{percent.format(achievement)}</strong><span>atingido</span><div className="progress"><i style={{ width: `${Math.min(100, achievement * 100)}%` }} /></div></div>
    </section>
  )
}

function Resumo({ state, monthName, onTarget }: { state: AppState; monthName: string; onTarget: (value: number) => void }) {
  const daysElapsed = Math.min(today.getDate(), monthDays)
  const workingReference = Math.max(1, daysElapsed)
  const average = state.sellOut / workingReference
  const remaining = Math.max(0, state.sellOutTarget - state.sellOut)
  const maxDaily = Math.max(...state.daily, 1)
  return (
    <>
      <section className="hero-strip">
        <div><div className="eyebrow light">VISÃO EXECUTIVA • {monthName.toUpperCase()}</div><h2>Venda, estoque e abastecimento.</h2><p>Uma leitura rápida do mês com separação entre faturado, a faturar e disponibilidade.</p></div>
        <div className="hero-number"><span>Sell Out atual</span><strong>{money.format(state.sellOut)}</strong></div>
      </section>

      <section className="metrics-grid five">
        <MetricCard label="SELL OUT TOTAL" value={money.format(state.sellOut)} hint="Faturado + venda a faturar" tone="red" />
        <MetricCard label="FATURADO" value={money.format(state.billed)} hint={percent.format(state.billed / Math.max(1, state.sellOut)) + ' do Sell Out'} tone="navy" />
        <MetricCard label="VENDA A FATURAR" value={money.format(state.toInvoice)} hint="Pedidos ainda não faturados" />
        <MetricCard label="POSITIVAÇÃO POTENCIAL" value={integer.format(state.potentialPositives)} hint="Referência comercial" />
        <MetricCard label="ESTOQUE AO CUSTO" value={money.format(state.stockCost)} hint="Posição disponível" />
      </section>

      <section className="two-columns dashboard-gap">
        <div className="panel">
          <SectionTitle kicker="MOVIMENTO DIÁRIO" title="Sell Out por dia" subtitle="O eixo mostra todos os dias do mês; dias futuros permanecem sem valor até acontecerem." />
          <div className="bar-chart">
            {state.daily.map((value, index) => {
              const day = index + 1
              const future = day > today.getDate()
              return <div className={`bar-slot ${future ? 'future' : ''}`} key={day} title={`${day}: ${money.format(value)}`}><div className="bar" style={{ height: `${value > 0 ? Math.max(5, value / maxDaily * 100) : 2}%` }} /><span>{day}</span></div>
            })}
          </div>
        </div>
        <div className="panel rhythm-panel">
          <SectionTitle kicker="RITMO DO MÊS" title="Referência de dias úteis" />
          <div className="rhythm-number"><span>Média por dia corrido</span><strong>{money.format(average)}</strong></div>
          <div className="rhythm-number"><span>Falta para a meta</span><strong>{money.format(remaining)}</strong></div>
          <div className="rhythm-number"><span>Progresso da meta</span><strong>{percent.format(state.sellOut / Math.max(1, state.sellOutTarget))}</strong></div>
          <p className="note">A referência de ritmo ainda será conectada ao calendário oficial de dias úteis.</p>
        </div>
      </section>
      <TargetFooter state={state} onTarget={onTarget} />
    </>
  )
}

function Gerencial({ state, totalTarget, totalSellOut, onNetworkTarget, onNetworkPool, onSellOutTarget }: { state: AppState; totalTarget: number; totalSellOut: number; onNetworkTarget: (index: number, value: number) => void; onNetworkPool: (value: number) => void; onSellOutTarget: (value: number) => void }) {
  return (
    <>
      <section className="page-head"><SectionTitle kicker="GERENCIAL" title="Redes estratégicas" subtitle="Participação, meta e histórico em uma leitura com mais contraste." /><div className="head-kpi"><span>Sell Out das redes</span><strong>{money.format(totalSellOut)}</strong></div></section>
      <section className="two-columns wide-left">
        <div className="panel">
          <div className="panel-toolbar"><div><div className="eyebrow red-text">REDES ESTRATÉGICAS</div><h3>Top redes • parcela da meta</h3></div><div className="network-pool"><span>Meta total das redes</span><CurrencyField value={totalTarget} onChange={onNetworkPool} /><small>{percent.format(totalTarget / Math.max(1, state.sellOutTarget))} da meta Sell Out T&C</small></div></div>
          <div className="network-list">
            {state.networks.map((network, index) => {
              const achievement = network.target > 0 ? network.sellOut / network.target : 0
              const participation = totalTarget > 0 ? network.target / totalTarget : 0
              return <div className="network-row" key={network.name}>
                <div className="network-name"><strong>{network.name}</strong><span>{percent.format(participation)} da meta das redes</span></div>
                <div className="network-cell"><span>Sell Out</span><strong>{money.format(network.sellOut)}</strong></div>
                <div className="network-cell editable"><span>Meta</span><CurrencyField value={network.target} onChange={value => onNetworkTarget(index, value)} /></div>
                <div className="network-cell"><span>Atingimento</span><strong className={achievement >= 1 ? 'good' : achievement >= .8 ? 'warn' : ''}>{percent.format(achievement)}</strong></div>
                <div className="mini-progress"><i style={{ width: `${Math.min(100, achievement * 100)}%` }} /></div>
              </div>
            })}
          </div>
          <p className="note">Ao editar uma rede, as demais metas são redistribuídas proporcionalmente para manter o total das redes.</p>
        </div>
        <div className="panel">
          <SectionTitle kicker="COMPARATIVO HISTÓRICO" title="Atual x referência anterior" />
          <div className="history-list">{state.networks.map(item => {
            const growth = item.previous > 0 ? item.sellOut / item.previous - 1 : 0
            return <div className="history-row" key={item.name}><span>{item.name}</span><strong>{money.format(item.sellOut)}</strong><b className={growth >= 0 ? 'good' : 'bad'}>{growth >= 0 ? '+' : ''}{percent.format(growth)}</b></div>
          })}</div>
        </div>
      </section>
      <TargetFooter state={state} onTarget={onSellOutTarget} />
    </>
  )
}

function Equipe({ state, onSellOutTarget }: { state: AppState; onSellOutTarget: (value: number) => void }) {
  const sellerTarget = state.sellers.reduce((sum, item) => sum + item.target, 0)
  const sellerSellOut = state.sellers.reduce((sum, item) => sum + item.sellOut, 0)
  const positives = state.sellers.reduce((sum, item) => sum + item.positives, 0)
  const positiveTarget = state.sellers.reduce((sum, item) => sum + item.positiveTarget, 0)
  return (
    <>
      <section className="page-head dark-head"><SectionTitle kicker="EQUIPE COMERCIAL" title="Execução por vendedor" subtitle="A operação vem primeiro; metas consolidadas ficam no fechamento da página." /><div className="head-kpi"><span>Sell Out equipe</span><strong>{money.format(sellerSellOut)}</strong></div></section>
      <section className="metrics-grid three compact">
        <MetricCard label="VENDEDORES" value={integer.format(state.sellers.length)} hint="Base demonstrativa desta reconstrução" tone="navy" />
        <MetricCard label="POSITIVAÇÕES" value={integer.format(positives)} hint={`${integer.format(positiveTarget)} de referência`} tone="red" />
        <MetricCard label="ATINGIMENTO DA EQUIPE" value={percent.format(sellerSellOut / Math.max(1, sellerTarget))} hint={money.format(sellerTarget) + ' em metas individuais'} />
      </section>
      <section className="panel table-panel">
        <div className="table-head"><div><div className="eyebrow red-text">DESEMPENHO INDIVIDUAL</div><h3>Vendedores</h3></div><span className="demo-badge">BASE DEMO • substituir pela Bússola</span></div>
        <div className="responsive-table"><table><thead><tr><th>Setor</th><th>Vendedor</th><th>Meta Bússola</th><th>Sell Out</th><th>Atingimento</th><th>Positivação</th><th>Meta Pos.</th><th>Cobertura</th></tr></thead><tbody>
          {state.sellers.map(seller => { const achieve = seller.sellOut / Math.max(1, seller.target); const pos = seller.positives / Math.max(1, seller.positiveTarget); return <tr key={seller.code}><td><b>{seller.code}</b></td><td>{seller.name}</td><td>{money.format(seller.target)}</td><td><strong>{money.format(seller.sellOut)}</strong></td><td><span className={`pill ${achieve >= 1 ? 'ok' : achieve >= .8 ? 'mid' : ''}`}>{percent.format(achieve)}</span></td><td>{integer.format(seller.positives)}</td><td>{integer.format(seller.positiveTarget)}</td><td>{percent.format(pos)}</td></tr> })}
        </tbody></table></div>
      </section>
      <section className="industry-targets">
        <div><div className="eyebrow light">METAS COLGATE • BÚSSOLA</div><h3>Consolidação das metas dos vendedores</h3><p>A soma das metas individuais define a referência da indústria. A meta Sell Out T&C permanece separada.</p></div>
        <MetricCard label="META INDÚSTRIA" value={money.format(sellerTarget)} hint="Soma dos vendedores" tone="red" />
        <MetricCard label="META POSITIVAÇÃO" value={integer.format(positiveTarget)} hint="Soma dos vendedores" tone="navy" />
      </section>
      <TargetFooter state={state} onTarget={onSellOutTarget} />
    </>
  )
}

function Estoque({ state }: { state: AppState }) {
  return (
    <>
      <section className="page-head"><SectionTitle kicker="ESTOQUE" title="Posição financeira e abastecimento" subtitle="Separação entre estoque atual, trânsito e preço de venda." /><div className="head-kpi"><span>Posição + trânsito</span><strong>{money.format(state.stockCost + state.stockTransit)}</strong></div></section>
      <section className="metrics-grid four">
        <MetricCard label="ESTOQUE ATUAL AO CUSTO" value={money.format(state.stockCost)} tone="navy" />
        <MetricCard label="ABASTECIMENTO EM TRÂNSITO" value={money.format(state.stockTransit)} tone="red" />
        <MetricCard label="POSIÇÃO AO CUSTO + TRÂNSITO" value={money.format(state.stockCost + state.stockTransit)} />
        <MetricCard label="ESTOQUE A PREÇO DE VENDA" value={money.format(state.stockSale)} />
      </section>
      <section className="panel table-panel">
        <div className="table-head"><div><div className="eyebrow red-text">POSIÇÃO FINANCEIRA POR LINHA</div><h3>Abertura do estoque</h3></div><span className="warning-badge">CLASSIFICAÇÃO A VALIDAR</span></div>
        <p className="stock-rule">Nesta reconstrução, os nomes de linha reproduzem a estrutura visual do painel original, mas <strong>não estamos tratando esse agrupamento como regra oficial</strong>. O vínculo será feito ao campo correto do cadastro 286 antes de usar os valores para decisão.</p>
        <div className="responsive-table"><table><thead><tr><th>Linha</th><th>Estoque custo</th><th>Em trânsito</th><th>Custo + trânsito</th><th>Preço de venda</th><th>Regra / origem</th></tr></thead><tbody>
          {state.stockLines.map(line => <tr key={line.name}><td><strong>{line.name}</strong></td><td>{money.format(line.cost)}</td><td>{money.format(line.transit)}</td><td>{money.format(line.cost + line.transit)}</td><td>{money.format(line.sale)}</td><td><span className="rule-chip">{line.rule}</span></td></tr>)}
        </tbody></table></div>
      </section>
    </>
  )
}

function Conferencia({ state }: { state: AppState }) {
  const checks = [
    ['Sell Out fecha com faturado + a faturar', Math.abs(state.sellOut - state.billed - state.toInvoice) < .02],
    ['Meta Sell Out T&C preenchida', state.sellOutTarget > 0],
    ['Metas individuais disponíveis', state.sellers.length > 0 && state.sellers.every(item => item.target > 0)],
    ['Classificação oficial de linhas de estoque', state.stockLines.every(item => !item.rule.toLowerCase().includes('validar'))],
  ] as const
  return (
    <>
      <section className="page-head"><SectionTitle kicker="CONFERÊNCIA" title="Rastreabilidade antes da leitura" subtitle="O painel não deve esconder pendências de base ou de regra." /></section>
      <section className="audit-grid">
        {checks.map(([label, ok]) => <div className={`audit-card ${ok ? 'pass' : 'pending'}`} key={label}><span>{ok ? '✓' : '!'}</span><div><strong>{label}</strong><small>{ok ? 'Conferido nesta base' : 'Pendente de validação'}</small></div></div>)}
      </section>
      <section className="panel">
        <SectionTitle kicker="FONTES" title="Arquivos vinculados nesta sessão local" />
        <div className="source-list">{Object.entries(state.uploads).map(([key, info]) => <div className="source-row" key={key}><strong>{sourceLabel(key)}</strong>{info ? <><span>{info.name}</span><small>{new Date(info.updatedAt).toLocaleString('pt-BR')}</small></> : <span className="muted">Ainda não carregado nesta reconstrução</span>}</div>)}</div>
      </section>
    </>
  )
}

function sourceLabel(key: string) {
  return ({ sales: 'Vendas • 8022', stock: 'Estoque físico • 8013', targets: 'Metas • Bússola', cost: 'Custo • Cadastro 286', transit: 'Em trânsito', history: 'Histórico anterior' } as Record<string, string>)[key] ?? key
}

function Upload({ state, onUpload, onReset }: { state: AppState; onUpload: (key: string, event: ChangeEvent<HTMLInputElement>) => void; onReset: () => void }) {
  const cards = [
    ['sales', 'VENDAS • RELATÓRIO 8022', 'Base de faturamento e movimento comercial'],
    ['stock', 'ESTOQUE FÍSICO • RELATÓRIO 8013', 'Saldo físico disponível'],
    ['targets', 'METAS • BÚSSOLA COLGATE', 'Metas individuais e de positivação'],
    ['cost', 'CUSTO • CADASTRO 286', 'Custo e classificação oficial dos produtos'],
    ['transit', 'COLGATE — MILÊNIO • EM TRÂNSITO', 'Abastecimento comprado ainda não recebido'],
    ['history', 'HISTÓRICO DO SISTEMA ANTERIOR', 'Referência histórica para comparativos'],
  ]
  return (
    <>
      <section className="upload-hero"><div className="eyebrow light">CENTRAL DE DADOS</div><h2>Venda, estoque e abastecimento.</h2><p>Os arquivos não são enviados para um servidor por este front-end. A configuração e a base processada permanecem no navegador para que o painel sobreviva ao F5.</p></section>
      <section className="upload-grid">
        {cards.map(([key, title, description]) => { const info = state.uploads[key]; return <label className="upload-card" key={key}><div className="upload-icon">↥</div><div><div className="eyebrow red-text">{title}</div><h3>{info ? info.name : 'Selecionar arquivo'}</h3><p>{description}</p>{info && <small>Registrado em {new Date(info.updatedAt).toLocaleString('pt-BR')} • {integer.format(info.size / 1024)} KB</small>}</div><input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={event => onUpload(key, event)} /></label> })}
      </section>
      <section className="local-storage-panel"><div><div className="eyebrow">PERSISTÊNCIA LOCAL</div><h3>A última base válida permanece neste navegador</h3><p>Ao atualizar ou fechar a página, metas, configurações e dados processados continuam disponíveis. Os parsers reais dos relatórios serão conectados na próxima etapa.</p></div><button className="danger-button" onClick={onReset}>Limpar base local</button></section>
    </>
  )
}

export default App
