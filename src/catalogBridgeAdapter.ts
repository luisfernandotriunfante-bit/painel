import { codeKey, isLikelyProductCodeHeader, saveProductCodeBridge } from './productCodeBridge'

export function buildAndSaveProductBridge(headers: unknown[], rows: unknown[][], startRow: number, canonicalColumn: number, source = 'Cadastro 286') {
  if (canonicalColumn < 0) return { aliases: 0, codeColumns: [] as number[] }
  const candidateColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(item => isLikelyProductCodeHeader(item.header))
    .map(item => item.index)

  if (!candidateColumns.includes(canonicalColumn)) candidateColumns.unshift(canonicalColumn)

  const bridge: Record<string, string> = {}
  const examples: string[] = []
  let usedRows = 0

  for (let r = startRow; r < rows.length; r += 1) {
    const row = rows[r] ?? []
    const canonical = codeKey(row[canonicalColumn])
    if (!canonical) continue
    usedRows += 1
    bridge[canonical] = canonical
    for (const col of candidateColumns) {
      const alias = codeKey(row[col])
      if (!alias) continue
      bridge[alias] = canonical
      if (alias !== canonical && examples.length < 12) examples.push(`${alias} → ${canonical}`)
    }
  }

  const diagnostics = {
    source,
    rows: usedRows,
    codeColumns: candidateColumns.map(index => String(headers[index] ?? `Coluna ${index + 1}`)),
    canonicalColumn: String(headers[canonicalColumn] ?? `Coluna ${canonicalColumn + 1}`),
    aliases: Object.keys(bridge).length,
    ambiguousAliases: 0,
    examples,
  }
  saveProductCodeBridge(bridge, diagnostics)
  return { aliases: diagnostics.aliases, codeColumns: candidateColumns }
}
