import * as XLSX from 'xlsx'
import { fillSheet1 } from './excelSheet1'
import { fillTeam } from './excelSheetTeam'
import { NS, parseXml, serializeXml } from './excelXmlCore'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function cfb() {
  const value: any = (XLSX as any).CFB
  if (!value) throw new Error('O mecanismo de Excel do painel não está disponível.')
  return value
}

function normalizePath(value: string) {
  return value
    .replace(/\\/g, '/')
    .replace(/^Root Entry\//i, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function locate(container: any, path: string) {
  const CFB = cfb()
  const direct = CFB.find(container, path) ?? CFB.find(container, `Root Entry/${path}`)
  if (direct) return direct

  const target = normalizePath(path)
  const fullPaths: string[] = container.FullPaths ?? []
  const index = fullPaths.findIndex(fullPath => normalizePath(fullPath) === target)
  return index >= 0 ? container.FileIndex?.[index] ?? null : null
}

function entry(container: any, path: string) {
  const item = locate(container, path)
  if (!item) throw new Error(`O modelo Excel selecionado não contém o componente obrigatório: ${path}`)
  return item
}

function put(container: any, path: string, text: string) {
  const item: any = entry(container, path)
  const bytes = encoder.encode(text)
  item.content = bytes
  item.size = bytes.length
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
  const CFB = cfb()
  const container = CFB.read(new Uint8Array(data))
  const sheet1Path = 'xl/worksheets/sheet1.xml'
  const sheet2Path = 'xl/worksheets/sheet2.xml'
  const workbookPath = 'xl/workbook.xml'
  const sheet1 = parseXml(decoder.decode(entry(container, sheet1Path).content))
  const sheet2 = parseXml(decoder.decode(entry(container, sheet2Path).content))
  const workbook = parseXml(decoder.decode(entry(container, workbookPath).content))
  const timing = fillSheet1(sheet1, state)
  fillTeam(sheet2, state, timing.worked, timing.targetDays)
  forceRecalc(workbook)
  put(container, sheet1Path, serializeXml(sheet1))
  put(container, sheet2Path, serializeXml(sheet2))
  put(container, workbookPath, serializeXml(workbook))

  const calcChain = locate(container, 'xl/calcChain.xml')
  if (calcChain) {
    try {
      const fullPaths: string[] = container.FullPaths ?? []
      const index = container.FileIndex?.indexOf(calcChain) ?? -1
      const actualPath = index >= 0 ? fullPaths[index] : 'xl/calcChain.xml'
      CFB.utils.cfb_del(container, actualPath)
    } catch {}
  }

  const output: any = CFB.write(container, { fileType: 'zip', compression: true })
  return output instanceof Uint8Array ? output : new Uint8Array(output)
}
