export const STORAGE_KEY='painel-sell-out-milenio:v3'
export function loadState(){const raw=localStorage.getItem(STORAGE_KEY);if(!raw)throw new Error('Carregue e processe as bases do painel antes de gerar o Excel.');return JSON.parse(raw)}
