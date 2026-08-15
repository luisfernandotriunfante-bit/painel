import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { fillSheet1 } from './excelSheet1'
import { fillTeam, updateTeamFilterDatabase } from './excelSheetTeam'
import { buildPanelMetrics } from './panelMetrics'
import { NS, parseXml, serializeXml } from './excelXmlCore'

function requireEntry(files: Record<string, Uint8Array>, path: string) {
  const value = files[path]
  if (!value) throw new Error(`O modelo Excel selecionado não contém o componente obrigatório: ${path}`)
  return value
}

function forceRecalc(document: XMLDocument) {
  let calc = document.getElementsByTagNameNS(NS, 'calcPr')[0]
  if (!calc) {
    calc = document.createElementNS(NS, 'calcPr')
    document.documentElement.appendChild(calc)
  }
  calc.setAttribute('calcMode', 'auto')
  calc.setAttribute('fullCalcOnLoad', '1')
  calc.setAttribute('forceFullCalc', '1')
}

export function buildExcel(data: ArrayBuffer, state: any) {
  const files = unzipSync(new Uint8Array(data))
  const sheet1Path = 'xl/worksheets/sheet1.xml'
  const sheet2Path = 'xl/worksheets/sheet2.xml'
  const workbookPath = 'xl/workbook.xml'

  const sheet1 = parseXml(strFromU8(requireEntry(files, sheet1Path)))
  const sheet2 = parseXml(strFromU8(requireEntry(files, sheet2Path)))
  const workbook = parseXml(strFromU8(requireEntry(files, workbookPath)))
  const metrics = buildPanelMetrics(state)

  fillSheet1(sheet1, state, metrics)
  const team = fillTeam(sheet2, metrics)
  updateTeamFilterDatabase(workbook, team.endRow)
  forceRecalc(workbook)

  files[sheet1Path] = strToU8(serializeXml(sheet1))
  files[sheet2Path] = strToU8(serializeXml(sheet2))
  files[workbookPath] = strToU8(serializeXml(workbook))
  delete files['xl/calcChain.xml']

  return zipSync(files, { level: 6 })
}
