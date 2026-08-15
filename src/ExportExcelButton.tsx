import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { exportDailyExcel, getOfficialExcelFileName } from './excelExport'
import { getExcelOutputHandle, hasExcelTemplate, saveExcelOutputHandle, saveExcelTemplate } from './excelTemplateStore'
import { buildPanelMetrics } from './panelMetrics'

const STORAGE_KEY = 'painel-sell-out-milenio:v3'

function supportsFileOverwrite() {
  return typeof (window as any).showSaveFilePicker === 'function'
}

async function chooseOutputFile(fileName: string) {
  return (window as any).showSaveFilePicker({
    suggestedName: fileName,
    types: [{
      description: 'Planilha Excel',
      accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    }],
  })
}

function pendingExcelBlocks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return buildPanelMetrics(JSON.parse(raw)).readiness.pendingCount
  } catch {
    return null
  }
}

export default function ExportExcelButton() {
  const input = useRef<HTMLInputElement | null>(null)
  const [ready, setReady] = useState(false)
  const [outputHandle, setOutputHandle] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<number | null>(pendingExcelBlocks)

  useEffect(() => {
    void Promise.all([hasExcelTemplate(), getExcelOutputHandle()]).then(([templateReady, handle]) => {
      setReady(templateReady)
      setOutputHandle(handle)
    })
    const timer = window.setInterval(() => setPending(pendingExcelBlocks()), 1200)
    return () => window.clearInterval(timer)
  }, [])

  async function run() {
    if (!ready) {
      input.current?.click()
      return
    }

    setBusy(true)
    setMessage('Gerando o modelo oficial...')
    try {
      const fileName = getOfficialExcelFileName()
      let handle = outputHandle

      if (supportsFileOverwrite()) {
        if (!handle || String(handle.name ?? '') !== fileName) {
          handle = await chooseOutputFile(fileName)
          setOutputHandle(handle)
          await saveExcelOutputHandle(handle)
        } else if (typeof handle.requestPermission === 'function') {
          const permission = await handle.requestPermission({ mode: 'readwrite' })
          if (permission !== 'granted') {
            handle = await chooseOutputFile(fileName)
            setOutputHandle(handle)
            await saveExcelOutputHandle(handle)
          }
        }
      }

      const result = await exportDailyExcel(handle)
      setPending(pendingExcelBlocks())
      setMessage(result.overwritten
        ? `${result.fileName} atualizado e substituído no mesmo local.`
        : `Download de ${result.fileName} iniciado.`)
    } catch (cause: any) {
      if (cause?.name === 'AbortError') setMessage('Salvamento cancelado.')
      else setMessage(cause instanceof Error ? cause.message : 'Falha ao gerar o Excel.')
    } finally {
      setBusy(false)
    }
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage('Salvando o modelo oficial neste navegador...')
    try {
      await saveExcelTemplate(file)
      setReady(true)
      setMessage('Modelo salvo. Clique em EXCEL DO DIA para gerar e vincular o arquivo mensal.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Falha ao salvar o modelo.')
    } finally {
      setBusy(false)
    }
  }

  const readiness = pending == null
    ? 'Carregue as bases do painel'
    : pending === 0
      ? 'Apuração completa para o Excel'
      : `${pending} pendência${pending === 1 ? '' : 's'} na Conferência`

  return <div className="excel-export-wrap">
    <input ref={input} hidden type="file" accept=".xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => void choose(event)} />
    <button className="excel-export-button" onClick={() => void run()} disabled={busy}>
      <span className="excel-export-icon">X</span>
      <span>
        <b>{busy ? 'PROCESSANDO...' : ready ? 'EXCEL DO DIA' : 'DEFINIR MODELO EXCEL'}</b>
        <small>{ready ? readiness : 'Selecione o modelo oficial uma única vez'}</small>
      </span>
    </button>
    {ready && <button className="excel-template-change" onClick={() => input.current?.click()} disabled={busy}>Trocar modelo</button>}
    {message && <small className="excel-export-status">{message}</small>}
    <style>{`.excel-export-wrap{display:grid;gap:7px;margin-top:auto;padding:14px 12px 8px}.excel-export-button{width:100%;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:11px 12px;background:rgba(255,255,255,.085);color:inherit;cursor:pointer;text-align:left;backdrop-filter:blur(16px)}.excel-export-button:disabled{opacity:.65;cursor:wait}.excel-export-icon{width:31px;height:31px;border-radius:9px;display:grid;place-items:center;background:#107c41;color:#fff;font-weight:900}.excel-export-button span:last-child{display:grid;gap:2px;min-width:0}.excel-export-button b{font-size:11px;letter-spacing:.075em}.excel-export-button small,.excel-export-status{font-size:10px;opacity:.68;line-height:1.35}.excel-export-status{padding:0 4px;overflow-wrap:anywhere}.excel-template-change{border:0;background:transparent;color:inherit;opacity:.55;font-size:10px;cursor:pointer;text-align:left;padding:0 4px}.excel-template-change:hover{opacity:.9}`}</style>
  </div>
}
