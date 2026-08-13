const fs = require('fs')
const path = 'src/AppV3.tsx'
const source = fs.readFileSync(path, 'utf8')
const start = source.indexOf('function Resumo({ state }: { state: AppState }) {')
const end = source.indexOf('function MovementChart(', start)
if (start < 0 || end < 0) throw new Error('Resumo/MovementChart anchors not found')

const nextResumo = `function Resumo({ state }: { state: AppState }) {
  const detailed = state.dailyMovement.some(item => item.billed !== 0 || item.toInvoice !== 0 || item.positives !== 0)
  return <>
    <section className="metrics enhanced-metrics four summary-kpis">
      <Metric label="SELL OUT TOTAL" value={state.uploads.sales ? money.format(state.sellOut) : '—'} tone="red" />
      <Metric label="FATURADO" value={state.uploads.sales ? money.format(state.billed) : '—'} tone="navy" />
      <Metric label="A FATURAR" value={state.uploads.sales ? money.format(state.toInvoice) : '—'} />
      <Metric label="POSITIVAÇÃO" value={state.uploads.sales ? integer.format(state.potentialPositives) : '—'} />
    </section>
    <section className="panel section-block movement-panel">
      <div className="section-bar"><div><span>MOVIMENTO DIÁRIO</span><h2>Faturado, a faturar e positivação</h2></div></div>
      {!state.uploads.sales ? <Empty>Carregue o 8022.</Empty> : <div className="movement-dashboard">
        <MovementChart data={state.dailyMovement} periodYear={state.periodYear} periodMonth={state.periodMonth} detailed={detailed} />
        <MovementTable data={state.dailyMovement} />
      </div>}
    </section>
  </>
}

`

const next = source.slice(0, start) + nextResumo + source.slice(end)
fs.writeFileSync(path, next)
