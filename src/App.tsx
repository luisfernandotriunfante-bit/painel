import { ChangeEvent, useEffect, useMemo, useState } from 'react'

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
const now = new Date()
const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

const seedDaily = Array.from({ length: monthDays }, (_, index) => {
  const sample = [182400, 224890, 196320, 0, 0, 281950, 307840, 247650, 265440, 312730, 298510, 326820]
  return index < sample.length ? sample[index] : 0
})

const initialState: AppState = {
  sellOut: 3742680.45,
  billed: 3512300.10,
  toInvoice: 230380.35,
  potentialPositives: 312,
  stockCost: 1824940.72,
  stockSale: 2341508.66,
  stockTransit: 418400,
  sellOutTarget: 5000000,
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
    { name: 'Creme Dental', cost: 578420.10, sale: 741870.30, transit: 126000, rule: 'A validar no cadastro 286' },
    { name: 'Sabonetes', cost: 337800.75, sale: 432910.40, transit: 84000, rule: 'A validar no cadastro 286' },
    { name: 'Hair', cost: 258340.62, sale: 331120.60, transit: 57600, rule: 'A validar no cadastro 286' },
    { name: 'Esc + Enx + Fio', cost: 224790.20, sale: 288210.30, transit: 50400, rule: 'A validar no cadastro 286' },
    { name: 'Limpeza', cost: 198440.55, sale: 254390.40, transit: 42600, rule: 'A validar no cadastro 286' },
    { name: 'Outros', cost: 227148.50, sale: 292996.66, transit: 57800, rule: 'A validar no cadastro 286' },
  ],
  daily: seedDaily,
  uploads: { sales: null, stock: null, targets: null, cost: null, transit: null, history: null },
}

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialState
    return { ...initialState, ...JSON.parse(saved) } as AppState
  } catch {
    return initialState
  }
}

function parseCurrency(raw: string) {
  const cleaned = raw.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : 0
}

function CurrencyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <input
      className="currency-input"
      value={editing ? draft : money.format(value)}
      onFocus={() => { setEditing(true); setDraft(value.toFixed(2).replace('.', ',')) }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { onChange(parseCurrency(draft)); setEditing(false) }}
    />
  )
}

function Metric({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</article>
}

function Title({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return <div className="title"><span>{kicker}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
}

function TargetFooter({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const achievement = state.sellOutTarget > 0 ? state.sellOut / state.sellOutTarget : 0
  return (
    <section className="target-footer">
      <div className="target-copy"><span>META SELL OUT • T&C</span><h3>Referência gerencial do mês</h3><p>Meta manual, separada das metas individuais importadas da Bússola.</p></div>
      <div className="target-field"><label>Meta do mês</label><CurrencyInput value={state.sellOutTarget} onChange={(value) => setState(current => ({ ...current, sellOutTarget: value }))} /></div>
      <div className="target-result"><strong>{percent.format(achievement)}</strong><span>atingido</span><div className="progress"><i style={{ width: `${Math.min(100, achievement * 100)}%` }} /></div></div>
    </section>
  )
}

function App() {
  const [page, setPage] = useState<Page>('resumo')
  const [state, setState] = useState<AppState>(loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const networkTarget = useMemo(() => state.networks.reduce((sum, item) => sum + item.target, 0), [state.networks])
  const networkSellOut = useMemo(() => state.networks.reduce((sum, item) => sum + item.sellOut, 0), [state.networks])
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  function changeNetworkPool(value: number) {
    setState(current => {
      const total = current.networks.reduce((sum, item) => sum + item.target, 0)
      if (total <= 0) return current
      return { ...current, networks: current.networks.map(item => ({ ...item, target: item.target * value / total })) }
    })
  }

  function changeNetworkTarget(index: number, requested: number) {
    setState(current => {
      const networks = current.networks.map(item => ({ ...item }))
      const total = networks.reduce((sum, item) => sum + item.target, 0)
      const old = networks[index].target
      const value = Math.max(0, Math.min(total, requested))
      const others = total - old
      networks[index].target = value
      if (others > 0) {
        const remaining = total - value
        networks.forEach((item, itemIndex) => {
          if (itemIndex !== index) item.target = item.target / others * remaining
        })
      }
      return { ...current, networks }
    })
  }

  function registerUpload(key: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setState(current => ({ ...current, uploads: { ...current.uploads, [key]: { name: file.name, size: file.size, updatedAt: new Date().toISOString() } } }))
  }

  function resetLocal() {
    if (!window.confirm('Apagar a base local e voltar para a demonstração?')) return
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState)
  }

  return (
    <div className="app">
      <header className="header">
        <div><span>MILÊNIO • INTELIGÊNCIA COMERCIAL</span><h1>Painel Sell Out</h1></div>
        <div className="header-status"><b><i /> Base local ativa</b><strong>{monthName}</strong></div>
      </header>

      <nav className="tabs">
        {([['resumo', 'Resumo'], ['gerencial', 'Gerencial'], ['equipe', 'Equipe'], ['estoque', 'Estoque'], ['conferencia', 'Conferência'], ['upload', 'Upload de dados']] as [Page, string][]).map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>
        ))}
      </nav>

      <main>
        {page === 'resumo' && <Resumo state={state} setState={setState} monthName={monthName} />}
        {page === 'gerencial' && <Gerencial state={state} setState={setState} totalTarget={networkTarget} totalSellOut={networkSellOut} changePool={changeNetworkPool} changeTarget={changeNetworkTarget} />}
        {page === 'equipe' && <Equipe state={state} setState={setState} />}
        {page === 'estoque' && <Estoque state={state} />}
        {page === 'conferencia' && <Conferencia state={state} />}
        {page === 'upload' && <Upload state={state} registerUpload={registerUpload} resetLocal={resetLocal} />}
      </main>
    </div>
  )
}

function Resumo({ state, setState, monthName }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; monthName: string }) {
  const maxDaily = Math.max(...state.daily, 1)
  const elapsed = Math.max(1, Math.min(now.getDate(), monthDays))
  return (
    <>
      <section className="hero">
        <div><span>VISÃO EXECUTIVA • {monthName.toUpperCase()}</span><h2>Venda, estoque e abastecimento.</h2><p>Leitura do mês com faturado, a faturar e disponibilidade separados.</p></div>
        <div><small>Sell Out atual</small><strong>{money.format(state.sellOut)}</strong></div>
      </section>

      <section className="metrics five">
        <Metric label="SELL OUT TOTAL" value={money.format(state.sellOut)} hint="Faturado + venda a faturar" tone="red" />
        <Metric label="FATURADO" value={money.format(state.billed)} hint={`${percent.format(state.billed / Math.max(1, state.sellOut))} do Sell Out`} tone="navy" />
        <Metric label="VENDA A FATURAR" value={money.format(state.toInvoice)} hint="Pedidos ainda não faturados" />
        <Metric label="POSITIVAÇÃO POTENCIAL" value={integer.format(state.potentialPositives)} hint="Referência comercial" />
        <Metric label="ESTOQUE AO CUSTO" value={money.format(state.stockCost)} hint="Posição disponível" />
      </section>

      <section className="split summary-split">
        <article className="panel chart-panel">
          <Title kicker="MOVIMENTO DIÁRIO" title="Sell Out por dia" subtitle="Todos os dias do mês aparecem no eixo. Dias futuros ficam vazios, sem inventar venda." />
          <div className="bars">
            {state.daily.map((value, index) => {
              const day = index + 1
              const future = day > now.getDate()
              return <div className={`bar-slot ${future ? 'future' : ''}`} key={day} title={`${day} • ${money.format(value)}`}><i style={{ height: `${value > 0 ? Math.max(5, value / maxDaily * 100) : 2}%` }} /><span>{day}</span></div>
            })}
          </div>
        </article>
        <article className="panel rhythm">
          <Title kicker="RITMO DO MÊS" title="Referência operacional" />
          <div><span>Média por dia corrido</span><strong>{money.format(state.sellOut / elapsed)}</strong></div>
          <div><span>Falta para a meta</span><strong>{money.format(Math.max(0, state.sellOutTarget - state.sellOut))}</strong></div>
          <div><span>Progresso da meta</span><strong>{percent.format(state.sellOut / Math.max(1, state.sellOutTarget))}</strong></div>
          <p className="note">O calendário oficial de dias úteis será ligado ao motor de dados na próxima etapa.</p>
        </article>
      </section>
      <TargetFooter state={state} setState={setState} />
    </>
  )
}

function Gerencial({ state, setState, totalTarget, totalSellOut, changePool, changeTarget }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; totalTarget: number; totalSellOut: number; changePool: (value: number) => void; changeTarget: (index: number, value: number) => void }) {
  return (
    <>
      <section className="page-head"><Title kicker="GERENCIAL" title="Redes estratégicas" subtitle="Meta, participação, Sell Out e comparativo histórico." /><div><span>Sell Out das redes</span><strong>{money.format(totalSellOut)}</strong></div></section>
      <section className="split managerial-split">
        <article className="panel">
          <div className="panel-toolbar"><div><span>REDES ESTRATÉGICAS</span><h3>Top redes • parcela do Sell Out T&C</h3></div><div className="pool"><label>Meta total das redes</label><CurrencyInput value={totalTarget} onChange={changePool} /><small>{percent.format(totalTarget / Math.max(1, state.sellOutTarget))} da meta T&C</small></div></div>
          <div className="network-list">
            {state.networks.map((network, index) => {
              const achievement = network.sellOut / Math.max(1, network.target)
              return <div className="network" key={network.name}>
                <div className="network-name"><strong>{network.name}</strong><span>{percent.format(network.target / Math.max(1, totalTarget))} da meta das redes</span></div>
                <div><span>Sell Out</span><strong>{money.format(network.sellOut)}</strong></div>
                <div className="editable"><span>Meta</span><CurrencyInput value={network.target} onChange={(value) => changeTarget(index, value)} /></div>
                <div><span>Atingimento</span><strong className={achievement >= 1 ? 'positive' : ''}>{percent.format(achievement)}</strong></div>
                <div className="mini-progress"><i style={{ width: `${Math.min(100, achievement * 100)}%` }} /></div>
              </div>
            })}
          </div>
          <p className="note">Se uma meta de rede for alterada, o restante é redistribuído proporcionalmente para manter a meta total das redes.</p>
        </article>
        <article className="panel">
          <Title kicker="COMPARATIVO HISTÓRICO" title="Atual x referência anterior" />
          <div className="history">
            {state.networks.map(network => {
              const growth = network.sellOut / Math.max(1, network.previous) - 1
              return <div key={network.name}><span>{network.name}</span><strong>{money.format(network.sellOut)}</strong><b className={growth >= 0 ? 'positive' : 'negative'}>{growth >= 0 ? '+' : ''}{percent.format(growth)}</b></div>
            })}
          </div>
        </article>
      </section>
      <TargetFooter state={state} setState={setState} />
    </>
  )
}

function Equipe({ state, setState }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }) {
  const sellerTarget = state.sellers.reduce((sum, seller) => sum + seller.target, 0)
  const sellerSellOut = state.sellers.reduce((sum, seller) => sum + seller.sellOut, 0)
  const positives = state.sellers.reduce((sum, seller) => sum + seller.positives, 0)
  const positiveTarget = state.sellers.reduce((sum, seller) => sum + seller.positiveTarget, 0)
  return (
    <>
      <section className="page-head dark"><Title kicker="EQUIPE COMERCIAL" title="Execução por vendedor" subtitle="A operação vem primeiro; as metas consolidadas fecham a página." /><div><span>Sell Out equipe</span><strong>{money.format(sellerSellOut)}</strong></div></section>
      <section className="metrics three"><Metric label="VENDEDORES" value={integer.format(state.sellers.length)} tone="navy" /><Metric label="POSITIVAÇÕES" value={integer.format(positives)} hint={`${integer.format(positiveTarget)} de meta`} tone="red" /><Metric label="ATINGIMENTO DA EQUIPE" value={percent.format(sellerSellOut / Math.max(1, sellerTarget))} hint={money.format(sellerTarget)} /></section>
      <article className="panel table-panel">
        <div className="table-title"><div><span>DESEMPENHO INDIVIDUAL</span><h3>Vendedores</h3></div><b>BASE DEMO • substituir pela Bússola</b></div>
        <div className="table-wrap"><table><thead><tr><th>Setor</th><th>Vendedor</th><th>Meta Bússola</th><th>Sell Out</th><th>Atingimento</th><th>Positivação</th><th>Meta Pos.</th><th>Cobertura</th></tr></thead><tbody>
          {state.sellers.map(seller => {
            const achievement = seller.sellOut / Math.max(1, seller.target)
            return <tr key={seller.code}><td><strong>{seller.code}</strong></td><td>{seller.name}</td><td>{money.format(seller.target)}</td><td><strong>{money.format(seller.sellOut)}</strong></td><td><span className={`pill ${achievement >= 1 ? 'ok' : achievement >= .8 ? 'mid' : ''}`}>{percent.format(achievement)}</span></td><td>{integer.format(seller.positives)}</td><td>{integer.format(seller.positiveTarget)}</td><td>{percent.format(seller.positives / Math.max(1, seller.positiveTarget))}</td></tr>
          })}
        </tbody></table></div>
      </article>
      <section className="industry-footer"><div><span>METAS COLGATE • BÚSSOLA</span><h3>Consolidação das metas dos vendedores</h3><p>A soma das metas individuais forma a meta da indústria. Ela não substitui a meta Sell Out T&C.</p></div><Metric label="META INDÚSTRIA" value={money.format(sellerTarget)} tone="red" /><Metric label="META POSITIVAÇÃO" value={integer.format(positiveTarget)} tone="navy" /></section>
      <TargetFooter state={state} setState={setState} />
    </>
  )
}

function Estoque({ state }: { state: AppState }) {
  return (
    <>
      <section className="page-head"><Title kicker="ESTOQUE" title="Posição financeira e abastecimento" subtitle="Custo, trânsito e preço de venda separados." /><div><span>Posição + trânsito</span><strong>{money.format(state.stockCost + state.stockTransit)}</strong></div></section>
      <section className="metrics four"><Metric label="ESTOQUE ATUAL AO CUSTO" value={money.format(state.stockCost)} tone="navy" /><Metric label="ABASTECIMENTO EM TRÂNSITO" value={money.format(state.stockTransit)} tone="red" /><Metric label="POSIÇÃO AO CUSTO + TRÂNSITO" value={money.format(state.stockCost + state.stockTransit)} /><Metric label="ESTOQUE A PREÇO DE VENDA" value={money.format(state.stockSale)} /></section>
      <article className="panel table-panel">
        <div className="table-title"><div><span>POSIÇÃO FINANCEIRA POR LINHA</span><h3>Abertura do estoque</h3></div><b className="warning">CLASSIFICAÇÃO A VALIDAR</b></div>
        <p className="stock-warning">Os nomes das linhas reproduzem a estrutura visual que já tínhamos, mas <strong>não são considerados regra oficial</strong>. Antes de usar essa abertura como dado definitivo, vamos ligar cada SKU ao campo correto do cadastro 286.</p>
        <div className="table-wrap"><table><thead><tr><th>Linha</th><th>Estoque custo</th><th>Em trânsito</th><th>Custo + trânsito</th><th>Preço de venda</th><th>Regra / origem</th></tr></thead><tbody>
          {state.stockLines.map(line => <tr key={line.name}><td><strong>{line.name}</strong></td><td>{money.format(line.cost)}</td><td>{money.format(line.transit)}</td><td>{money.format(line.cost + line.transit)}</td><td>{money.format(line.sale)}</td><td><span className="rule">{line.rule}</span></td></tr>)}
        </tbody></table></div>
      </article>
    </>
  )
}

function Conferencia({ state }: { state: AppState }) {
  const checks: [string, boolean][] = [
    ['Sell Out fecha com faturado + a faturar', Math.abs(state.sellOut - state.billed - state.toInvoice) < 0.02],
    ['Meta Sell Out T&C preenchida', state.sellOutTarget > 0],
    ['Metas individuais disponíveis', state.sellers.length > 0 && state.sellers.every(seller => seller.target > 0)],
    ['Classificação oficial de linhas de estoque', state.stockLines.every(line => !line.rule.toLowerCase().includes('validar'))],
  ]
  return (
    <>
      <section className="page-head"><Title kicker="CONFERÊNCIA" title="Rastreabilidade antes da leitura" subtitle="Pendências de base ou regra ficam visíveis; não são mascaradas." /></section>
      <section className="audit-grid">{checks.map(([label, ok]) => <article className={ok ? 'pass' : 'pending'} key={label}><b>{ok ? '✓' : '!'}</b><div><strong>{label}</strong><span>{ok ? 'Conferido nesta base' : 'Pendente de validação'}</span></div></article>)}</section>
      <article className="panel"><Title kicker="FONTES" title="Arquivos vinculados neste navegador" /><div className="sources">{Object.entries(state.uploads).map(([key, info]) => <div key={key}><strong>{sourceLabel(key)}</strong>{info ? <><span>{info.name}</span><small>{new Date(info.updatedAt).toLocaleString('pt-BR')}</small></> : <span className="muted">Ainda não carregado</span>}</div>)}</div></article>
    </>
  )
}

function sourceLabel(key: string) {
  const labels: Record<string, string> = { sales: 'Vendas • 8022', stock: 'Estoque físico • 8013', targets: 'Metas • Bússola', cost: 'Custo • Cadastro 286', transit: 'Em trânsito', history: 'Histórico anterior' }
  return labels[key] ?? key
}

function Upload({ state, registerUpload, resetLocal }: { state: AppState; registerUpload: (key: string, event: ChangeEvent<HTMLInputElement>) => void; resetLocal: () => void }) {
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
      <section className="upload-hero"><span>CENTRAL DE DADOS</span><h2>Venda, estoque e abastecimento.</h2><p>O front-end não envia estes arquivos para um servidor. Configurações e dados processados são preservados localmente para continuar após F5.</p></section>
      <section className="upload-grid">
        {cards.map(([key, title, description]) => {
          const info = state.uploads[key]
          return <label className="upload-card" key={key}><b>↥</b><div><span>{title}</span><h3>{info ? info.name : 'Selecionar arquivo'}</h3><p>{description}</p>{info && <small>Registrado em {new Date(info.updatedAt).toLocaleString('pt-BR')} • {integer.format(info.size / 1024)} KB</small>}</div><input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(event) => registerUpload(key, event)} /></label>
        })}
      </section>
      <section className="storage"><div><span>PERSISTÊNCIA LOCAL</span><h3>A última base válida permanece neste navegador</h3><p>Nesta reconstrução inicial os arquivos são registrados e o estado do painel já persiste. Os parsers reais serão conectados aos relatórios na etapa seguinte.</p></div><button onClick={resetLocal}>Limpar base local</button></section>
    </>
  )
}

export default App
