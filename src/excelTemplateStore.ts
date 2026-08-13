import * as XLSX from 'xlsx'

const DB_NAME = 'painel-sell-out-milenio-assets'
const STORE_NAME = 'files'
const TEMPLATE_KEY = 'excel-template-v1'

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

export async function saveExcelTemplate(file: File) {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(data), { type: 'array', bookSheets: true })
  if (!workbook.SheetNames.includes('SELL OUT - Milenio 2026') || !workbook.SheetNames.includes('EQUIPES')) {
    throw new Error('Selecione o modelo oficial com as abas SELL OUT - Milenio 2026 e EQUIPES.')
  }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(value => value.toString(16).padStart(2, '0')).join('')
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ data, name: file.name, size: file.size, hash, savedAt: new Date().toISOString() }, TEMPLATE_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  database.close()
  return { hash, name: file.name }
}

export async function getExcelTemplate() {
  const database = await openDatabase()
  const value: any = await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(TEMPLATE_KEY)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return value ?? null
}

export async function hasExcelTemplate() {
  return Boolean(await getExcelTemplate())
}
