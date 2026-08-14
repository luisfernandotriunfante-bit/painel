import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'
const RETURN_PAGE_KEY = 'painel-sell-out-milenio:return-page'

type NetworkTarget = { target: number; locked: boolean }
type StoredCustomer = { cnpj: string; value: number }
type StoredState = {
  networkPoolTarget?: number
  strategicNetworks?: string[]
  networkTargets?: Record<string, NetworkTarget>
  networkByCnpj?: Record<string, string>
  salesCustomers?: StoredCustomer[]
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

function readState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function parseCurrency(raw: string) {
  const cleaned = raw.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : 0
}

function CurrencyEditor({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return <input
    className="currency-input network-meta-currency"
    value={editing ? draft : money.format(value)}
    onFocus={() => { setEditing(true); setDraft(value.toFixed(2).replace('.', ',')) }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      onChange(parseCurrency(draft))
      setEditing(false)
    }}
  />
}

function sellOutByNetwork(state: StoredState) {
  const totals = new Map<string, number>()
  for (const customer of state.salesCustomers ?? []) {
    const network = state.networkByCnpj?.[customer.cnpj]
    if (!network) continue
    totals.set(network, (totals.get(network) ?? 0) + (Number(customer.value) || 0))
  }
  return totals
}

export default function NetworkMetaConfigOverlay() {
  const [mainTarget, setMainTarget] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [stored, setStored] = useState<StoredState>(() => readState())
  const [pool, setPool] = useState(Number(stored.networkPoolTarget) || 0)
  const [networks, setNetworks] = useState<string[]>(() => [...(stored.strategicNetworks ?? [])])
  const [targets, setTargets] = useState<Record<string, NetworkTarget>>(() => ({ ...(stored.networkTargets ?? {}) }))
  const [addChoice, setAddChoice] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let lastRaw = localStorage.getItem(STORAGE_KEY) ?? ''
    const refresh = () => {
      setMainTarget(document.querySelector<HTMLElement>('main.v3-main'))
      setVisible(document.documentElement.dataset.dashboardPage === 'metas')
      const raw = localStorage.getItem(STORAGE_KEY) ?? ''
      if (raw !== lastRaw && !dirty) {
        lastRaw = raw
        const next = readState()
        setStored(next)
        setPool(Number(next.networkPoolTarget) || 0)
        setNetworks([...(next.strategicNetworks ?? [])])
        setTargets({ ...(next.networkTargets ?? {}) })
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 700)
    return () => window.clearInterval(timer)
  }, [dirty])

  const networkSales = useMemo(() => sellOutByNetwork(stored), [stored])
  const availableNetworks = useMemo(() => {
    const all = new Set<string>()
    networks.forEach(name => name && all.add(name))
    Object.values(stored.networkByCnpj ?? {}).forEach(name => name && all.add(name))
    return [...all].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [networks, stored.networkByCnpj])
  const addOptions = availableNetworks.filter(name => !networks.includes(name))

  const rows = networks.map(name => ({
    name,
    target: Number(targets[name]?.target) || 0,
    locked: Boolean(targets[name]?.locked),
    sellOut: Number(networkSales.get(name)) || 0,
  }))
  const sumTargets = rows.reduce((sum, row) => sum + row.target, 0)
  const sellOutTotal = rows.reduce((sum, row) => sum + row.sellOut, 0)

  function normalizeToPool(nextNetworks: string[], nextTargets: Record<string, NetworkTarget>, nextPool = pool) {
    const lockedRows = nextNetworks.filter(name => nextTargets[name]?.locked)
    const lockedTotal = lockedRows.reduce((sum, name) => sum + (Number(nextTargets[name]?.target) || 0), 0)
    const safePool = Math.max(nextPool, lockedTotal)
    const unlocked = nextNetworks.filter(name => !nextTargets[name]?.locked)
    const available = Math.max(0, safePool - lockedTotal)
    const currentTotal = unlocked.reduce((sum, name) => sum + (Number(nextTargets[name]?.target) || 0), 0)
    const salesTotal = unlocked.reduce((sum, name) => sum + (Number(networkSales.get(name)) || 0), 0)
    const normalized = { ...nextTargets }

    unlocked.forEach(name => {
      const current = Number(nextTargets[name]?.target) || 0
      const sales = Number(networkSales.get(name)) || 0
      const weight = currentTotal > 0 ? current / currentTotal : salesTotal > 0 ? sales / salesTotal : 1 / Math.max(1, unlocked.length)
      normalized[name] = { target: available * weight, locked: false }
    })
    lockedRows.forEach(name => {
      normalized[name] = { target: Number(nextTargets[name]?.target) || 0, locked: true }
    })
    return { pool: safePool, targets: normalized }
  }

  function changePool(value: number) {
    const normalized = normalizeToPool(networks, targets, value)
    setPool(normalized.pool)
    setTargets(normalized.targets)
    setDirty(true)
  }

  function changeTarget(name: string, requested: number) {
    if (pool <= 0) {
      setTargets(current => ({ ...current, [name]: { target: Math.max(0, requested), locked: Boolean(current[name]?.locked) } }))
      setDirty(true)
      return
    }
    const currentRow = rows.find(row => row.name === name)
    if (!currentRow) return
    const lockedOthers = rows.filter(row => row.name !== name && row.locked)
    const lockedTotal = lockedOthers.reduce((sum, row) => sum + row.target, 0)
    const value = Math.max(0, Math.min(requested, pool - lockedTotal))
    const candidates = rows.filter(row => row.name !== name && !row.locked)
    const remaining = Math.max(0, pool - lockedTotal - value)
    const candidateTotal = candidates.reduce((sum, row) => sum + row.target, 0)
    const candidateSales = candidates.reduce((sum, row) => sum + row.sellOut, 0)
    const next = { ...targets, [name]: { target: value, locked: currentRow.locked } }

    candidates.forEach(row => {
      const weight = candidateTotal > 0 ? row.target / candidateTotal : candidateSales > 0 ? row.sellOut / candidateSales : 1 / Math.max(1, candidates.length)
      next[row.name] = { target: remaining * weight, locked: false }
    })
    lockedOthers.forEach(row => { next[row.name] = { target: row.target, locked: true } })
    setTargets(next)
    setDirty(true)
  }

  function toggleLock(name: string) {
    const row = rows.find(item => item.name === name)
    if (!row) return
    setTargets(current => ({ ...current, [name]: { target: row.target, locked: !row.locked } }))
    setDirty(true)
  }

  function addNetwork() {
    if (!addChoice || networks.includes(addChoice)) return
    const nextNetworks = [...networks, addChoice]
    const nextTargets = { ...targets, [addChoice]: targets[addChoice] ?? { target: 0, locked: false } }
    const normalized = normalizeToPool(nextNetworks, nextTargets)
    setNetworks(nextNetworks)
    setTargets(normalized.targets)
    setPool(normalized.pool)
    setAddChoice('')
    setDirty(true)
  }

  function removeNetwork(name: string) {
    const nextNetworks = networks.filter(item => item !== name)
    const nextTargets = { ...targets }
    delete nextTargets[name]
    const normalized = normalizeToPool(nextNetworks, nextTargets)
    setNetworks(nextNetworks)
    setTargets(normalized.targets)
    setPool(normalized.pool)
    setDirty(true)
  }

  function replaceNetwork(oldName: string, newName: string) {
    if (!newName || oldName === newName || networks.includes(newName)) return
    const nextNetworks = networks.map(name => name === oldName ? newName : name)
    const nextTargets = { ...targets, [newName]: { ...(targets[oldName] ?? { target: 0, locked: false }) } }
    delete nextTargets[oldName]
    setNetworks(nextNetworks)
    setTargets(nextTargets)
    setDirty(true)
  }

  function save() {
    const current = readState()
    const nextTargets: Record<string, NetworkTarget> = {}
    networks.forEach(name => { nextTargets[name] = targets[name] ?? { target: 0, locked: false } })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      networkPoolTarget: pool,
      strategicNetworks: networks,
      networkTargets: nextTargets,
    }))
    sessionStorage.setItem(RETURN_PAGE_KEY, 'metas')
    window.location.reload()
  }

  if (!visible || !mainTarget) return null

  return createPortal(<section className="panel section-block network-meta-config-panel">
    <div className="section-bar network-meta-heading">
      <div><span>METAS DAS REDES</span><h2>Configuração das redes e distribuição da meta</h2></div>
      <button className="network-meta-save" disabled={!dirty} onClick={save}>{dirty ? 'Salvar alterações' : 'Configuração salva'}</button>
    </div>

    <div className="network-meta-pool-row">
      <div><span>META TOTAL DAS REDES</span><CurrencyEditor value={pool} onChange={changePool} /></div>
      <div className="network-meta-total"><span>SOMA DAS METAS INDIVIDUAIS</span><strong>{money.format(sumTargets)}</strong><small className={Math.abs(sumTargets - pool) < .01 ? 'ok' : 'warn'}>{Math.abs(sumTargets - pool) < .01 ? 'Fechando com a meta total' : `Diferença ${money.format(pool - sumTargets)}`}</small></div>
      <div className="network-meta-add"><span>ACRESCENTAR REDE</span><div><select value={addChoice} onChange={event => setAddChoice(event.target.value)}><option value="">Selecionar rede mapeada</option>{addOptions.map(name => <option key={name} value={name}>{name}</option>)}</select><button onClick={addNetwork} disabled={!addChoice}>Adicionar</button></div><small>A lista vem das redes existentes na Base de Premissas.</small></div>
    </div>

    <div className="table-scroll"><table className="network-meta-table">
      <thead><tr><th>Rede</th><th>Participação atual</th><th>Sell Out atual</th><th>Meta</th><th>Participação da meta</th><th>Estado</th><th /></tr></thead>
      <tbody>{rows.map(row => <tr key={row.name}>
        <td><select className="network-meta-select" value={row.name} onChange={event => replaceNetwork(row.name, event.target.value)}>{availableNetworks.map(name => <option key={name} value={name} disabled={name !== row.name && networks.includes(name)}>{name}</option>)}</select></td>
        <td>{sellOutTotal ? percent.format(row.sellOut / sellOutTotal) : '—'}</td>
        <td>{money.format(row.sellOut)}</td>
        <td className="network-meta-target"><CurrencyEditor value={row.target} onChange={value => changeTarget(row.name, value)} /></td>
        <td>{pool ? percent.format(row.target / pool) : '—'}</td>
        <td><button className={row.locked ? 'lock-button locked' : 'lock-button'} onClick={() => toggleLock(row.name)}>{row.locked ? 'Travada' : 'Travar'}</button></td>
        <td><button className="network-meta-remove" onClick={() => removeNetwork(row.name)} title={`Remover ${row.name}`}>Remover</button></td>
      </tr>)}</tbody>
    </table></div>
    {!networks.length && <div className="empty-state compact-empty">Nenhuma rede configurada. Selecione uma rede mapeada acima para começar.</div>}
    <div className="network-meta-note">Ao alterar a meta de uma rede, o saldo é redistribuído proporcionalmente entre as demais redes não travadas. Redes podem ser adicionadas, removidas ou substituídas sem alterar o total definido.</div>
  </section>, mainTarget)
}
