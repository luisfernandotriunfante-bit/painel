import { buildExcel } from './excelPackage'
import { loadState } from './excelState'
import { getExcelTemplate } from './excelTemplateStore'

export async function exportDailyExcel() {
  const state = loadState()
  if (!state.salesSellerActuals?.length && !state.dailyMovement?.length) throw new Error('Carregue o relatório 8022 antes de gerar o Excel do dia.')
  const template = await getExcelTemplate()
  if (!template?.data) throw new Error('Selecione o modelo oficial do Excel uma vez antes da primeira exportação.')
  const bytes = buildExcel(template.data, state)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Painel Sell Out MILENIO - ${String(state.periodMonth).padStart(2, '0')}-${state.periodYear} - ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
