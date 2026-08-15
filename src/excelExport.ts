import { buildExcel } from './excelPackage'
import { loadState } from './excelState'
import { getExcelTemplate } from './excelTemplateStore'

function officialFileName(year: number, month: number) {
  const rawMonth = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  const displayMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)
  const shortYear = String(year).slice(-2)
  return `Painel Sell Out MILENIO-${displayMonth}'${shortYear}.xlsx`
}

export function getOfficialExcelFileName() {
  const state = loadState()
  return officialFileName(state.periodYear, state.periodMonth)
}

export async function exportDailyExcel(outputHandle?: any) {
  const state = loadState()
  if (!state.salesSellerActuals?.length && !state.dailyMovement?.length) throw new Error('Carregue o relatório 8022 antes de gerar o Excel do dia.')
  const template = await getExcelTemplate()
  if (!template?.data) throw new Error('Selecione o modelo oficial do Excel uma vez antes da primeira exportação.')
  const bytes = buildExcel(template.data, state)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const fileName = officialFileName(state.periodYear, state.periodMonth)

  if (outputHandle?.createWritable) {
    const writable = await outputHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return { fileName, overwritten: true }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  return { fileName, overwritten: false }
}
