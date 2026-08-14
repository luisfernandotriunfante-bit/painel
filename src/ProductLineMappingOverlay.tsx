import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PRODUCT_LINE_NAMES,
  ProductLineChoice,
  readProductLineMap,
  readUnclassifiedProducts,
  UnclassifiedProduct,
  writeProductLineMap,
} from './productLineMap'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

type DraftMap = Record<string, ProductLineChoice | ''>

export default function ProductLineMappingOverlay() {
  const [main, setMain] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [items, setItems] = useState<UnclassifiedProduct[]>(() => readUnclassifiedProducts())
  const [draft, setDraft] = useState<DraftMap>(() => ({ ...readProductLineMap() }))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const refresh = () => {
      const page = document.documentElement.dataset.dashboardPage ?? ''
      setVisible(page === 'conferência' || page === 'conferencia')
      setMain(document.querySelector<HTMLElement>('main.v3-main'))
      if (!saved) {
        setItems(readUnclassifiedProducts())
        setDraft(current => ({ ...readProductLineMap(), ...current }))
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 900)
    return () => window.clearInterval(timer)
  }, [saved])

  const pendingValue = useMemo(() => items.reduce((sum, item) => sum + Number(item.value || 0), 0), [items])
  const assignable = items.filter(item => item.code)
  const chosen = assignable.filter(item => Boolean(draft[item.code])).length

  function save() {
    const next = { ...readProductLineMap() }
    for (const item of assignable) {
      const line = draft[item.code]
      if (line) next[item.code] = line
    }
    writeProductLineMap(next)
    setSaved(true)
  }

  if (!visible || !main || !items.length) return null

  return createPortal(
    <section className="panel section-block product-line-mapping-panel">
      <div className="section-bar">
        <div>
          <span>CONFERÊNCIA DE LINHAS</span>
          <h2>Produtos do 8022 sem linha definida</h2>
        </div>
        <div className="status-pill warn">{items.length} pendente(s) • {money.format(pendingValue)}</div>
      </div>

      <div className="safe-note" style={{ marginBottom: 14 }}>
        O agrupamento e a descrição não conseguiram classificar estes produtos. Defina a linha uma única vez; o SKU ficará salvo neste navegador e será reutilizado nas próximas apurações. Use “Outros” quando o item realmente não pertencer às cinco linhas do painel.
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>SKU</th><th>Descrição</th><th>Sell Out pendente</th><th>Linha</th></tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.code}-${item.description}-${index}`}>
                <td><b>{item.code || 'Sem código no 8022'}</b></td>
                <td>{item.description || '—'}</td>
                <td>{money.format(item.value)}</td>
                <td>
                  {item.code ? (
                    <select
                      value={draft[item.code] ?? ''}
                      onChange={event => {
                        setSaved(false)
                        setDraft(current => ({ ...current, [item.code]: event.target.value as ProductLineChoice | '' }))
                      }}
                    >
                      <option value="">Selecionar</option>
                      {PRODUCT_LINE_NAMES.map(line => <option key={line} value={line}>{line}</option>)}
                      <option value="Outros">Outros / fora das 5 linhas</option>
                    </select>
                  ) : <span className="status-pill warn">Código necessário</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 14 }}>
        <small>{saved ? 'Mapeamentos salvos. Recarregue o 8022 uma vez para recalcular as linhas e limpar estas pendências.' : `${chosen} de ${assignable.length} produtos com linha selecionada.`}</small>
        <button type="button" className="network-meta-save" onClick={save} disabled={!chosen}>Salvar mapeamentos</button>
      </div>
    </section>,
    main,
  )
}
