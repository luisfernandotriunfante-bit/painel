export type State=any
export const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
export const ratio=(v:number,b:number)=>b?v/b:0
export const trend=(v:number,w:number,t:number)=>w>0?v/w*t:0
export const monthKey=(y:number,m:number)=>`${y}-${String(m).padStart(2,'0')}`
export function excelSerial(y:number,m:number,d:number,h=0,mi=0,s=0){return Date.UTC(y,m-1,d,h,mi,s)/86400000+25569}
export function monthName(y:number,m:number){return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long'}).toUpperCase()}
export function weekdays(y:number,m:number,through:number){let c=0;for(let d=1;d<=through;d++){const w=new Date(y,m-1,d).getDay();if(w!==0&&w!==6)c++}return c}
export function throughDay(y:number,m:number){const t=new Date(),last=new Date(y,m,0).getDate();if(y<t.getFullYear()||(y===t.getFullYear()&&m<t.getMonth()+1))return last;if(y===t.getFullYear()&&m===t.getMonth()+1)return Math.min(t.getDate(),last);return 0}
function shift(y:number,m:number,o:number){const d=new Date(y,m-1+o,1);return[d.getFullYear(),d.getMonth()+1] as const}
export function sumMonth(s:State,y:number,m:number){return Object.values(s.historyByMonth?.[monthKey(y,m)]??{}).reduce((a:any,v:any)=>a+n(v),0) as number}
export function avg3(s:State){const a=[-1,-2,-3].map(o=>{const[y,m]=shift(s.periodYear,s.periodMonth,o);return sumMonth(s,y,m)}).filter(Boolean);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function positiveMonthCount(s:State,y:number,m:number){const values=Object.values(s.historyByMonth?.[monthKey(y,m)]??{});return values.reduce((count,value)=>count+(n(value)>0?1:0),0)}
export function avg3Pos(s:State){const a=[-1,-2,-3].map(o=>{const[y,m]=shift(s.periodYear,s.periodMonth,o);return positiveMonthCount(s,y,m)}).filter(Boolean);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
