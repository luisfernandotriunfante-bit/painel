import JSZip from 'jszip'
import { fillSheet1 } from './excelSheet1'
import { fillTeam } from './excelSheetTeam'
import { NS, parseXml, serializeXml } from './excelXmlCore'

function requireFile(zip: JSZip, path: string) {
  const file = zip.file(path)
  if (!file) throw new Error(`O modelo Excel selecionado não contém o componente obrigatório: ${path}`)
  return file
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

export async function buildExcel(data: ArrayBuffer, state: any) {
  const zip = await JSZip.loadAsync(data)
  const sheet1Path = 'xl/worksheets/sheet1.xml'
  const sheet2Path = 'xl/worksheets/sheet2.xml'
  const workbookPath = 'xl/workbook.xml'

  const [sheet1Xml, sheet2Xml, workbookXml] = await Promise.all([
    requireFile(zip, sheet1Path).async('string'),
    requireFile(zip, sheet2Path).async('string'),
    requireFile(zip, workbookPath).async('string'),
  ])

  const sheet1 = parseXml(sheet1Xml)
  const sheet2 = parseXml(sheet2Xml)
  const workbook = parseXml(workbookXml)

  const timing = fillSheet1(sheet1, state)
  fillTeam(sheet2, state, timing.worked, timing.targetDays)
  forceRecalc(workbook)

  zip.file(sheet1Path, serializeXml(sheet1))
  zip.file(sheet2Path, serializeXml(sheet2))
  zip.file(workbookPath, serializeXml(workbook))
  zip.remove('xl/calcChain.xml')

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
