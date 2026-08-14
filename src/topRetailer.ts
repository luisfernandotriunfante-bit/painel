import * as XLSX from 'xlsx'

export type TopRetailerGroup = {
  key: string
  name: string
  groupCode: string
  managerCnpj: string
  target: number
  customers: number
  goldCustomers: number
  silverCustomers: number
}

export type TopRetailerResult = {
  groups: TopRetailerGroup[]
  rows: number
  totalTarget: number
  fileMonthLabel: string
  warnings: string[]
}

type Matrix = unknown[][]

export function normalizeTopText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function cleanId(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.replace(/^0+/, '') || (digits ? '0' : '')
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let text = String(value ?? '').trim()
  if (!text) return 0
  text = text.replace(/R\$/gi, '').replace(/\s/g, '')
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.')
  else if (text.includes(',')) text = text.replace(',', '.')
  const parsed = Number(text.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function findHeader(rows: Matrix) {
  let best = { row: -1, score: -1 }
  for (let r = 0; r < Math.min(rows.length, 30); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeTopText)
    const score = ['DISTRIBUIDOR', 'CNPJ', 'COD AGRUPAMENTO', 'CNPJ GESTOR', 'META'].reduce(
      (sum, marker) => sum + (headers.some(header => header === marker || header.includes(marker)) ? 1 : 0), 0,
    )
    if (score > best.score) best = { row: r, score }
  }
  return best
}

function findColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeTopText)
  const wanted = aliases.map(normalizeTopText)
  const exact = normalized.findIndex(header => wanted.includes(header))
  if (exact >= 0) return exact
  return normalized.findIndex(header => wanted.some(alias => header.includes(alias)))
}

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>()
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function displayName(rawBanner: string, rawRede: string, groupCode: string) {
  const banner = rawBanner.trim()
  const rede = rawRede.trim()
  const group = groupCode.replace(/^REDE\s+/i, '').trim()
  const normalized = normalizeTopText(`${banner} ${rede} ${group}`)
  if (/\bABV\b|\bABEVE\b/.test(normalized)) return 'ABV'
  if (/\bMEGA\b|\bVRA\b/.test(normalized)) return 'MEGA'
  if (normalized.includes('NOVA ESTRELA')) return 'NOVA ESTRELA'
  if (/\bPORTAL\b|\bDAMASCENO\b/.test(normalized)) return 'PORTAL'
  if (/\bPRINCESA\b/.test(normalized)) return 'PRINCESA'
  return banner || rede || group || groupCode
}

export async function parseTopRetailerRoteiro(file: File): Promise<TopRetailerResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: true })
  const sheetName = workbook.SheetNames.find(name => normalizeTopText(name).includes('ROTEIRO ATIVO')) ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error('O arquivo Top Varejistas não contém uma aba Roteiro Ativo reconhecível.')
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Matrix
  const match = findHeader(rows)
  if (match.row < 0 || match.score < 4) throw new Error('Não consegui reconhecer as colunas do Roteiro Ativo Top Varejistas.')

  const headers = rows[match.row] ?? []
  const distributorCol = findColumn(headers, ['DISTRIBUIDOR'])
  const cnpjCol = findColumn(headers, ['CNPJ'])
  const bannerCol = findColumn(headers, ['BANDEIRA'])
  const networkCol = findColumn(headers, ['REDE'])
  const managerCol = findColumn(headers, ['CNPJ GESTOR'])
  const groupCol = findColumn(headers, ['COD AGRUPAMENTO', 'COD. AGRUPAMENTO'])
  const categoryCol = findColumn(headers, ['CATEGORIA'])
  const metaCol = findColumn(headers, ['META'])
  if (distributorCol < 0 || cnpjCol < 0 || metaCol < 0) throw new Error('Roteiro Top sem DISTRIBUIDOR, CNPJ ou META.')

  type Bucket = { banners: string[]; networks: string[]; groupCode: string; managerCnpj: string; target: number; cnpjs: Set<string>; gold: Set<string>; silver: Set<string> }
  const groups = new Map<string, Bucket>()
  let usedRows = 0

  for (let r = match.row + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    if (normalizeTopText(row[distributorCol]) !== 'MILENIO') continue
    const cnpj = cleanId(row[cnpjCol])
    if (!cnpj) continue
    const manager = cleanId(row[managerCol])
    const rawGroup = String(row[groupCol] ?? '').trim()
    const key = normalizeTopText(rawGroup) || manager || cnpj
    const bucket = groups.get(key) ?? { banners: [], networks: [], groupCode: rawGroup, managerCnpj: manager, target: 0, cnpjs: new Set<string>(), gold: new Set<string>(), silver: new Set<string>() }
    const banner = String(row[bannerCol] ?? '').trim()
    const network = String(row[networkCol] ?? '').trim()
    if (banner) bucket.banners.push(banner)
    if (network) bucket.networks.push(network)
    if (!bucket.groupCode && rawGroup) bucket.groupCode = rawGroup
    if (!bucket.managerCnpj && manager) bucket.managerCnpj = manager
    bucket.target += numberValue(row[metaCol])
    bucket.cnpjs.add(cnpj)
    const category = normalizeTopText(row[categoryCol])
    if (category === 'OURO') bucket.gold.add(cnpj)
    if (category === 'PRATA') bucket.silver.add(cnpj)
    groups.set(key, bucket)
    usedRows += 1
  }

  const resultGroups = [...groups.entries()].map(([key, bucket]) => {
    const banner = mostFrequent(bucket.banners)
    const network = mostFrequent(bucket.networks)
    return {
      key,
      name: displayName(banner, network, bucket.groupCode),
      groupCode: bucket.groupCode,
      managerCnpj: bucket.managerCnpj,
      target: bucket.target,
      customers: bucket.cnpjs.size,
      goldCustomers: bucket.gold.size,
      silverCustomers: bucket.silver.size,
    }
  }).sort((a, b) => b.target - a.target)

  const totalTarget = resultGroups.reduce((sum, group) => sum + group.target, 0)
  const monthMatch = headers.map(value => String(value ?? '')).join(' ').match(/META\s+([A-ZÇ]{3})['’]?\s*(\d{2})/i)
  const fileMonthLabel = monthMatch ? `${monthMatch[1].toUpperCase()}/${monthMatch[2]}` : file.name
  const warnings: string[] = []
  if (!usedRows) warnings.push('Nenhuma linha do distribuidor MILENIO foi localizada no Roteiro Ativo.')
  if (!resultGroups.some(group => group.target > 0)) warnings.push('As linhas Milênio foram encontradas, mas nenhuma META positiva foi localizada.')

  return { groups: resultGroups, rows: usedRows, totalTarget, fileMonthLabel, warnings }
}

function simplified(value: string) {
  return normalizeTopText(value)
    .replace(/\bREDE\b/g, ' ')
    .replace(/\bSUPERMERCADOS?\b/g, ' ')
    .replace(/\bATACADISTA\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function groupMatchesNetwork(group: TopRetailerGroup, networkName: string) {
  const network = simplified(networkName)
  const haystack = simplified(`${group.name} ${group.groupCode}`)
  if (!network || !haystack) return false
  if (network === haystack || haystack.includes(network) || network.includes(haystack)) return true
  if (/\bABV\b|\bABEVE\b/.test(network) && /\bABV\b|\bABEVE\b/.test(haystack)) return true
  if (/\bMEGA\b|\bVRA\b/.test(network) && /\bMEGA\b|\bVRA\b/.test(haystack)) return true
  if (network.includes('NOVA ESTRELA') && haystack.includes('NOVA ESTRELA')) return true
  if ((network.includes('PORTAL') || network.includes('PRINCESA')) && (haystack.includes('PORTAL') || haystack.includes('PRINCESA') || haystack.includes('DAMASCENO'))) return true
  const networkTokens = network.split(' ').filter(token => token.length >= 4)
  return networkTokens.length > 0 && networkTokens.every(token => haystack.includes(token))
}

export function topTargetForNetwork(groups: TopRetailerGroup[] | undefined, networkName: string) {
  const matches = (groups ?? []).filter(group => groupMatchesNetwork(group, networkName))
  if (!matches.length) return { target: 0, customers: 0, groups: [] as TopRetailerGroup[], matched: false }
  return {
    target: matches.reduce((sum, group) => sum + group.target, 0),
    customers: matches.reduce((sum, group) => sum + group.customers, 0),
    groups: matches,
    matched: true,
  }
}
