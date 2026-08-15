import * as XLSX from 'xlsx'

const DB_NAME = 'painel-sell-out-milenio-assets'
const STORE_NAME = 'files'
const TEMPLATE_KEY = 'excel-template-v1'
const OUTPUT_HANDLE_KEY = 'excel-output-handle-v1'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putValue(key: string, value: unknown) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  database.close()
}

async function getValue(key: string) {
  const database = await openDatabase()
  const value: any = await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return value ?? null
}

export async function saveExcelTemplate(file: File) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Use como modelo o arquivo .xlsx sem “FORMULA” no nome. O .xlsm serve somente como referência de cálculo.')
  }
  if (file.name.toUpperCase().includes('FORMULA')) {
    throw new Error('Selecione a planilha oficial sem “FORMULA” no nome. A versão FORMULA é apenas a referência das regras.')
  }

  const data = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(data), { type: 'array', bookSheets: true })
  if (!workbook.SheetNames.includes('SELL OUT - Milenio 2026') || !workbook.SheetNames.includes('EQUIPES')) {
    throw new Error('Selecione o modelo oficial com as abas SELL OUT - Milenio 2026 e EQUIPES.')
  }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(value => value.toString(16).padStart(2, '0')).join('')
  await putValue(TEMPLATE_KEY, { data, name: file.name, size: file.size, hash, savedAt: new Date().toISOString() })
  return { hash, name: file.name }
}

export async function getExcelTemplate() {
  return getValue(TEMPLATE_KEY)
}

export async function hasExcelTemplate() {
  return Boolean(await getExcelTemplate())
}

export async function saveExcelOutputHandle(handle: unknown) {
  try {
    await putValue(OUTPUT_HANDLE_KEY, handle)
  } catch {
    // Some browsers do not allow FileSystemHandle structured cloning into IndexedDB.
    // The current session can still use the handle kept by the React component.
  }
}

export async function getExcelOutputHandle() {
  try {
    return await getValue(OUTPUT_HANDLE_KEY)
  } catch {
    return null
  }
}
