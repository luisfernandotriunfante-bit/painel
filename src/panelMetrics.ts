import {
  avg3,
  avg3Pos,
  monthKey,
  n,
  officialWorkedDays,
  officialWorkingDays,
  ratio,
  sumMonth,
  trend,
} from './excelMath'

export const EXCEL_LINE_NAMES = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'] as const
export type ExcelLineName = typeof EXCEL_LINE_NAMES[number]

export const DEFAULT_LINE_TARGET_SHARES: Record<ExcelLineName, number> = {
  'Creme Dental': 0.525,
  'Esc + Enx + Fio': 0.095,
  Sabonetes: 0.20,
  Hair: 0.095,
  Limpeza: 0.085,
}

export type PanelMetrics = ReturnType<typeof buildPanelMetrics>

type RcaEntry = {
  currentCode?: string
  name?: string
  coordinatorCode?: string
  coordinatorName?: string
}

function cleanCode(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? (digits.replace(/^0+/, '') || '0') : String(value ?? '').trim()
}

function currentCode(code: string, map: Record<string, RcaEntry>) {
  const clean = cleanCode(code)
  if (map?.[clean]?.currentCode) return cleanCode(map[clean].currentCode)
  const match = Object.values(map ?? {}).find(item => cleanCode(item.currentCode) === clean)
  return match ? cleanCode(match.currentCode) : clean
}

function currentEntry(code: string, map: Record<string, RcaEntry>) {
  const clean = currentCode(code, map)
  const direct = map?.[clean]
  if (direct && cleanCode(direct.currentCode) === clean) return direct
  return Object.values(map ?? {}).find(item => cleanCode(item.currentCode) === clean) ?? null
}

function codeSort(a: string, b: string) {
  const na = Number(a), nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.localeCompare(b, 'pt-BR', { numeric: true })
}

function uploadLoaded(state: any, key: string) {
  return Boolean(state.uploads?.[key])
}

function uploadDate(state: any, key: string) {
  const raw = state.uploads?.[key]?.updatedAt
  return raw ? String(raw) : ''
}

function configuredLineShares(state: any) {
  const raw = state.lineTargetShares ?? {}
  const result = { ...DEFAULT_LINE_TARGET_SHARES }
  for (const name of EXCEL_LINE_NAMES) {
    const value = Number(raw[name])
    if (Number.isFinite(value) && value >= 0) result[name] = value
  }
  return result
}

function lineShareTotal(shares: Record<ExcelLineName, number>) {
  return EXCEL_LINE_NAMES.reduce((sum, name) => sum + n(shares[name]), 0)
}

function buildTeam(state: any, workedDays: number, targetDays: number) {
  const map: Record<string, RcaEntry> = state.rcaByOldCode ?? {}
  const actual = new Map<string, any>()
  for (const item of state.salesSellerActuals ?? []) {
    const key = currentCode(String(item.code), map)
    const row = actual.get(key) ?? { name: '', billed: 0, toInvoice: 0, total: 0, billedPos: 0, toInvoicePos: 0, totalPos: 0 }
    const billed = item.billed == null ? 0 : n(item.billed)
    const toInvoice = item.toInvoice == null ? Math.max(0, n(item.sellOut) - billed) : n(item.toInvoice)
    const billedPos = item.billedPositives == null ? 0 : n(item.billedPositives)
    const toInvoicePos = item.toInvoicePositives == null ? Math.max(0, n(item.positives) - billedPos) : n(item.toInvoicePositives)
    row.name = String(item.name ?? row.name ?? '')
    row.billed += billed
    row.toInvoice += toInvoice
    row.total += billed + toInvoice
    row.billedPos += billedPos
    row.toInvoicePos += toInvoicePos
    row.totalPos += n(item.positives)
    actual.set(key, row)
  }

  const targets = new Map<string, any>()
  for (const item of state.sellerTargets ?? []) {
    const key = currentCode(String(item.code), map)
    const row = targets.get(key) ?? { name: '', target: 0, positiveTarget: 0 }
    row.name = String(item.name ?? row.name ?? '')
    row.target += n(item.target)
    row.positiveTarget += n(item.positiveTarget)
    targets.set(key, row)
  }

  const remainingDays = Math.max(0, targetDays - workedDays)
  const codes = [...new Set([...targets.keys(), ...actual.keys()])].sort(codeSort)
  const rows = codes.map(code => {
    const goalRow = targets.get(code) ?? { name: '', target: 0, positiveTarget: 0 }
    const actualRow = actual.get(code) ?? { name: '', billed: 0, toInvoice: 0, total: 0, billedPos: 0, toInvoicePos: 0, totalPos: 0 }
    const entry = currentEntry(code, map)
    const target = n(goalRow.target)
    const positiveTarget = n(goalRow.positiveTarget)
    const idealRaw = targetDays > 0 ? target / targetDays * workedDays : 0
    const idealPositiveRaw = targetDays > 0 ? positiveTarget / targetDays * workedDays : 0
    const showIdeal = idealRaw > actualRow.total
    const showPositiveIdeal = idealPositiveRaw > actualRow.totalPos
    const positiveGap = positiveTarget - actualRow.totalPos

    return {
      code,
      name: String(entry?.name || goalRow.name || actualRow.name || `Setor ${code}`),
      coordinatorCode: String(entry?.coordinatorCode ?? ''),
      coordinatorName: String(entry?.coordinatorName ?? ''),
      target,
      billed: actualRow.billed,
      billedAchievement: ratio(actualRow.billed, target),
      toInvoice: actualRow.toInvoice,
      total: actualRow.total,
      totalAchievement: ratio(actualRow.total, target),
      ideal: showIdeal ? idealRaw : null,
      idealGap: showIdeal ? idealRaw - actualRow.total : null,
      targetGap: Math.max(0, target - actualRow.total),
      positiveTarget,
      billedPositives: actualRow.billedPos,
      billedPositiveAchievement: ratio(actualRow.billedPos, positiveTarget),
      toInvoicePositives: actualRow.toInvoicePos,
      totalPositives: actualRow.totalPos,
      totalPositiveAchievement: ratio(actualRow.totalPos, positiveTarget),
      idealPositives: showPositiveIdeal ? idealPositiveRaw : null,
      idealPositiveGap: showPositiveIdeal ? idealPositiveRaw - actualRow.totalPos : null,
      positiveGap,
      positiveTargetPerDay: remainingDays > 0 ? Math.max(0, positiveGap / remainingDays) : null,
    }
  })

  const totals = rows.reduce((sum, row) => {
    sum.target += row.target
    sum.billed += row.billed
    sum.toInvoice += row.toInvoice
    sum.total += row.total
    sum.ideal += row.ideal ?? 0
    sum.idealGap += row.idealGap ?? 0
    sum.targetGap += row.targetGap
    sum.positiveTarget += row.positiveTarget
    sum.billedPositives += row.billedPositives
    sum.toInvoicePositives += row.toInvoicePositives
    sum.totalPositives += row.totalPositives
    sum.idealPositives += row.idealPositives ?? 0
    sum.idealPositiveGap += row.idealPositiveGap ?? 0
    sum.positiveGap += row.positiveGap
    sum.positiveTargetPerDay += row.positiveTargetPerDay ?? 0
    return sum
  }, {
    target: 0, billed: 0, toInvoice: 0, total: 0, ideal: 0, idealGap: 0, targetGap: 0,
    positiveTarget: 0, billedPositives: 0, toInvoicePositives: 0, totalPositives: 0,
    idealPositives: 0, idealPositiveGap: 0, positiveGap: 0, positiveTargetPerDay: 0,
  })

  return {
    rows,
    totals: {
      ...totals,
      billedAchievement: ratio(totals.billed, totals.target),
      totalAchievement: ratio(totals.total, totals.target),
      billedPositiveAchievement: ratio(totals.billedPositives, totals.positiveTarget),
      totalPositiveAchievement: ratio(totals.totalPositives, totals.positiveTarget),
    },
  }
}

export function buildPanelMetrics(state: any, referenceDate = new Date()) {
  const year = n(state.periodYear) || referenceDate.getFullYear()
  const month = n(state.periodMonth) || referenceDate.getMonth() + 1
  const officialTargetDays = officialWorkingDays(year, month)
  const configuredTargetDays = n(state.workingDaysTarget)
  const targetDays = configuredTargetDays > 0 ? configuredTargetDays : officialTargetDays
  const workedDays = Math.min(targetDays, officialWorkedDays(year, month, referenceDate))
  const remainingDays = Math.max(0, targetDays - workedDays)

  const daily = Array.isArray(state.dailyMovement) ? state.dailyMovement.map((item: any) => ({
    day: n(item.day),
    billed: n(item.billed),
    toInvoice: n(item.toInvoice),
    sellOut: n(item.sellOut),
    positives: n(item.positives),
    billedPositives: n(item.billedPositives),
    toInvoicePositives: n(item.toInvoicePositives),
  })) : []
  const hasDaily = daily.length > 0
  const dailyBilled = daily.reduce((sum: number, item: any) => sum + item.billed, 0)
  const dailyToInvoice = daily.reduce((sum: number, item: any) => sum + item.toInvoice, 0)
  const dailySellOut = daily.reduce((sum: number, item: any) => sum + item.sellOut, 0)
  const dailyPositives = daily.reduce((sum: number, item: any) => sum + item.positives, 0)

  const billed = hasDaily ? dailyBilled : n(state.billed)
  const toInvoice = hasDaily ? dailyToInvoice : n(state.toInvoice)
  const sellOut = hasDaily ? dailySellOut : n(state.sellOut)
  const target = n(state.sellOutTarget) || n(state.industryTarget)
  const billedTrend = trend(billed, workedDays, targetDays)
  const sellOutTrend = trend(sellOut, workedDays, targetDays)
  const previous = sumMonth(state, year - 1, month)
  const average3 = avg3(state)
  const dailyTarget = ratio(target, targetDays)
  const currentDaily = ratio(sellOut, workedDays)
  const neededDaily = remainingDays > 0 ? (target - sellOut) / remainingDays : 0

  const coverageTargetDays = n(state.excelCoverageTargetDays) > 0 ? n(state.excelCoverageTargetDays) : 60
  const dailyBase = average3 > 0 ? average3 / 30 : 0
  const positionCost = n(state.positionCost)
  const positionSale = n(state.positionSale)
  const transitCost = n(state.stockTransit)
  const markup = positionCost > 0 ? positionSale / positionCost - 1 : 0
  const transitSale = transitCost * (1 + markup)
  const totalCost = positionCost + transitCost
  const totalSale = positionSale + transitSale

  const positiveTarget = n(state.industryPositiveTarget)
  const positives = n(state.potentialPositives)
  const positiveTrend = trend(positives, workedDays, targetDays)
  const positiveAverage3 = avg3Pos(state)

  const networkNames = (state.strategicNetworks ?? []).slice(0, 5)
  const buckets = new Map(networkNames.map((name: string) => [name, { customers: new Set<string>(), billed: 0, toInvoice: 0, sellOut: 0, previous: 0 }]))
  for (const customer of state.salesCustomers ?? []) {
    const cnpj = String(customer.cnpj ?? '')
    const network = state.networkByCnpj?.[cnpj]
    const bucket = buckets.get(network)
    if (!bucket) continue
    bucket.customers.add(cnpj)
    bucket.billed += n(customer.billed)
    bucket.toInvoice += n(customer.toInvoice)
    bucket.sellOut += customer.value == null ? n(customer.billed) + n(customer.toInvoice) : n(customer.value)
  }
  const previousByCnpj = state.historyByMonth?.[monthKey(year - 1, month)] ?? {}
  for (const [cnpj, value] of Object.entries(previousByCnpj)) {
    const network = state.networkByCnpj?.[cnpj]
    const bucket = buckets.get(network)
    if (bucket) bucket.previous += n(value)
  }
  const networks = networkNames.map((name: string) => {
    const bucket = buckets.get(name)!
    const networkTarget = n(state.networkTargets?.[name]?.target)
    const networkBilledTrend = trend(bucket.billed, workedDays, targetDays)
    const networkSellOutTrend = trend(bucket.sellOut, workedDays, targetDays)
    return {
      name,
      customers: bucket.customers.size,
      target: networkTarget,
      previous: bucket.previous,
      billed: bucket.billed,
      billedAchievement: ratio(bucket.billed, networkTarget),
      billedTrend: networkBilledTrend,
      billedTrendAchievement: ratio(networkBilledTrend, networkTarget),
      toInvoice: bucket.toInvoice,
      sellOut: bucket.sellOut,
      sellOutAchievement: ratio(bucket.sellOut, networkTarget),
      sellOutTrend: networkSellOutTrend,
      sellOutTrendAchievement: ratio(networkSellOutTrend, networkTarget),
      variationVsPrevious: bucket.previous ? bucket.sellOut / bucket.previous - 1 : null,
    }
  })
  const networkPoolTarget = n(state.networkPoolTarget) || networks.reduce((sum: number, row: any) => sum + row.target, 0)
  const networkBilled = networks.reduce((sum: number, row: any) => sum + row.billed, 0)
  const networkToInvoice = networks.reduce((sum: number, row: any) => sum + row.toInvoice, 0)
  const networkSellOut = networks.reduce((sum: number, row: any) => sum + row.sellOut, 0)

  const shares = configuredLineShares(state)
  const shareTotal = lineShareTotal(shares)
  const lineBilled = Object.fromEntries(EXCEL_LINE_NAMES.map(name => [name, 0])) as Record<ExcelLineName, number>
  let hasBilledLineDetail = false
  let hasLegacyLineDetail = false
  for (const seller of state.salesSellerActuals ?? []) {
    if (seller.lineSales && Object.keys(seller.lineSales).length) hasLegacyLineDetail = true
    if (!seller.lineBilledSales || !Object.keys(seller.lineBilledSales).length) continue
    hasBilledLineDetail = true
    EXCEL_LINE_NAMES.forEach(name => { lineBilled[name] += n(seller.lineBilledSales?.[name]) })
  }
  const budgetConfigured = Boolean(state.lineBudgetUsedConfigured)
  const budgetRecord = state.lineBudgetUsed ?? {}
  const lines = EXCEL_LINE_NAMES.map(name => {
    const lineTarget = target * shares[name]
    const billedValue = lineBilled[name]
    const budgetUsed = budgetConfigured ? n(budgetRecord[name]) : null
    return {
      name,
      targetShare: shares[name],
      target: lineTarget,
      billed: billedValue,
      achievement: ratio(billedValue, lineTarget),
      billedTrend: trend(billedValue, workedDays, targetDays),
      budgetUsed,
      budgetPctOfBilled: budgetUsed == null || billedValue === 0 ? null : budgetUsed / billedValue,
    }
  })

  const team = buildTeam(state, workedDays, targetDays)

  const sources = [
    { key: 'sales', label: '8022 • Vendas / A faturar', loaded: uploadLoaded(state, 'sales'), updatedAt: uploadDate(state, 'sales') },
    { key: 'targets', label: 'Bússola • Metas e positivação', loaded: uploadLoaded(state, 'targets'), updatedAt: uploadDate(state, 'targets') },
    { key: 'rcas', label: 'De-Para • RCAs / coordenação', loaded: uploadLoaded(state, 'rcas'), updatedAt: uploadDate(state, 'rcas') },
    { key: 'premises', label: 'Premissas • CNPJ → rede', loaded: uploadLoaded(state, 'premises'), updatedAt: uploadDate(state, 'premises') },
    { key: 'history', label: 'Histórico • comparativos', loaded: uploadLoaded(state, 'history'), updatedAt: uploadDate(state, 'history') },
    { key: 'position', label: '105 • estoque financeiro', loaded: uploadLoaded(state, 'position'), updatedAt: uploadDate(state, 'position') },
    { key: 'transit', label: 'Carteira • trânsito', loaded: uploadLoaded(state, 'transit'), updatedAt: uploadDate(state, 'transit') },
  ]

  const checks = [
    { block: 'Movimento diário', ok: uploadLoaded(state, 'sales') && hasDaily, detail: hasDaily ? 'Dias, faturado, a faturar, Sell Out e positivação disponíveis.' : 'Reprocesse o 8022.' },
    { block: 'Resumo / ritmo', ok: uploadLoaded(state, 'sales') && target > 0, detail: target > 0 ? 'Meta e ritmo calculáveis.' : 'Defina a Meta Sell Out / carregue a Bússola.' },
    { block: 'Histórico', ok: uploadLoaded(state, 'history') && previous > 0 && average3 > 0, detail: 'Mês anterior comparável e média dos últimos 3 meses.' },
    { block: 'Estoque', ok: uploadLoaded(state, 'position') && uploadLoaded(state, 'transit'), detail: 'Posição a custo/venda, carteira e coberturas.' },
    { block: 'Positivação', ok: uploadLoaded(state, 'sales') && positiveTarget > 0, detail: 'Meta, realizado, tendência e média histórica.' },
    { block: 'Top 5 Redes', ok: uploadLoaded(state, 'sales') && uploadLoaded(state, 'premises') && networks.length > 0, detail: `${networks.length}/5 redes configuradas para o modelo oficial.` },
    { block: 'Linhas de produto', ok: hasBilledLineDetail && Math.abs(shareTotal - 1) < 0.0001, detail: hasBilledLineDetail ? 'Faturado por linha disponível.' : (hasLegacyLineDetail ? '8022 precisa ser reprocessado para separar Faturado de A Faturar.' : 'Sem detalhamento por linha.') },
    { block: 'Verba por linha', ok: budgetConfigured, detail: budgetConfigured ? 'Verba utilizada informada no painel.' : 'Sem fonte automática atual; informe em Configurações → Metas para preencher este bloco.' },
    { block: 'Equipes', ok: uploadLoaded(state, 'sales') && uploadLoaded(state, 'targets') && team.rows.length > 0, detail: `${team.rows.length} RCAs com meta ou movimento.` },
  ]

  return {
    period: { year, month, updatedAt: referenceDate.toISOString() },
    timing: { targetDays, configuredTargetDays, officialTargetDays, workedDays, remainingDays },
    daily,
    summary: {
      target,
      billed,
      toInvoice,
      sellOut,
      billedAchievement: ratio(billed, target),
      sellOutAchievement: ratio(sellOut, target),
      billedTrend,
      sellOutTrend,
      billedTrendAchievement: ratio(billedTrend, target),
      sellOutTrendAchievement: ratio(sellOutTrend, target),
      previous,
      variationTrendVsPrevious: previous ? billedTrend / previous - 1 : null,
      average3,
      variationTrendVsAverage3: average3 ? billedTrend / average3 - 1 : null,
      dailyTarget,
      currentDaily,
      currentDailyAchievement: ratio(currentDaily, dailyTarget),
      neededDaily,
      neededDailyAchievement: ratio(neededDaily, dailyTarget),
    },
    stock: {
      coverageTargetDays,
      dailyBase,
      positionCost,
      positionSale,
      markup,
      transitCost,
      transitSale,
      totalCost,
      totalSale,
      saleCoverage: ratio(positionSale, dailyBase),
      saleCoverageGap: coverageTargetDays - ratio(positionSale, dailyBase),
      totalSaleCoverage: ratio(totalSale, dailyBase),
      costCoverage: ratio(positionCost, dailyBase),
      costCoverageGap: coverageTargetDays - ratio(positionCost, dailyBase),
      totalCostCoverage: ratio(totalCost, dailyBase),
    },
    positives: {
      target: positiveTarget,
      current: positives,
      achievement: ratio(positives, positiveTarget),
      trend: positiveTrend,
      trendAchievement: ratio(positiveTrend, positiveTarget),
      average3: positiveAverage3,
      average3Achievement: ratio(positiveAverage3, positiveTarget),
    },
    networks,
    networkTotals: {
      target: networkPoolTarget,
      billed: networkBilled,
      billedAchievement: ratio(networkBilled, networkPoolTarget),
      toInvoice: networkToInvoice,
      sellOut: networkSellOut,
      sellOutAchievement: ratio(networkSellOut, networkPoolTarget),
    },
    lines,
    lineShareTotal: shareTotal,
    hasBilledLineDetail,
    hasLegacyLineDetail,
    budgetConfigured,
    team: team.rows,
    teamTotals: team.totals,
    reconciliation: {
      dailySellOut,
      dailyBilled,
      dailyToInvoice,
      dailyPositives,
      consolidatedSellOut: n(state.sellOut),
      consolidatedBilled: n(state.billed),
      consolidatedToInvoice: n(state.toInvoice),
      consolidatedPositives: n(state.potentialPositives),
      sellOutVsBilled: dailySellOut - dailyBilled,
      billedDelta: n(state.billed) - dailyBilled,
      sellOutDelta: n(state.sellOut) - dailySellOut,
      positiveDelta: n(state.potentialPositives) - dailyPositives,
    },
    sources,
    checks,
    readiness: {
      complete: checks.every(item => item.ok),
      pendingCount: checks.filter(item => !item.ok).length,
      pending: checks.filter(item => !item.ok),
    },
  }
}
