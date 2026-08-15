export type State=any
export const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
export const ratio=(v:number,b:number)=>b?v/b:0
export const trend=(v:number,w:number,t:number)=>w>0?v/w*t:0
export const monthKey=(y:number,m:number)=>`${y}-${String(m).padStart(2,'0')}`
export function excelSerial(y:number,m:number,d:number,h=0,mi=0,s=0){return Date.UTC(y,m-1,d,h,mi,s)/86400000+25569}
export function monthName(y:number,m:number){return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long'}).toUpperCase()}
export function weekdays(y:number,m:number,through:number){let c=0;for(let d=1;d<=through;d++){const w=new Date(y,m-1,d).getDay();if(w!==0&&w!==6)c++}return c}
export function throughDay(y:number,m:number){const t=new Date(),last=new Date(y,m,0).getDate();if(y<t.getFullYear()||(y===t.getFullYear()&&m<t.getMonth()+1))return last;if(y===t.getFullYear()&&m===t.getMonth()+1)return Math.min(t.getDate(),last);return 0}

function easterSunday(year:number){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1
  return new Date(year,month-1,day)
}
function dateKey(value:Date){return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`}
function addDays(value:Date,days:number){const result=new Date(value.getFullYear(),value.getMonth(),value.getDate());result.setDate(result.getDate()+days);return result}
export function officialHolidays(year:number){
  const easter=easterSunday(year)
  return [
    new Date(year,0,1),
    addDays(easter,-2),
    easter,
    new Date(year,3,21),
    new Date(year,4,1),
    new Date(year,5,13),
    addDays(easter,60),
    new Date(year,7,26),
    new Date(year,8,7),
    new Date(year,9,11),
    new Date(year,9,12),
    new Date(year,10,2),
    new Date(year,10,15),
    new Date(year,10,20),
    new Date(year,11,25),
    new Date(year+1,0,1),
  ]
}
export function businessDays(start:Date,end:Date,holidays:Date[]=[]){
  if(end<start)return 0
  const blocked=new Set(holidays.map(dateKey))
  let count=0
  const cursor=new Date(start.getFullYear(),start.getMonth(),start.getDate())
  const last=new Date(end.getFullYear(),end.getMonth(),end.getDate())
  while(cursor<=last){
    const day=cursor.getDay()
    if(day!==0&&day!==6&&!blocked.has(dateKey(cursor)))count++
    cursor.setDate(cursor.getDate()+1)
  }
  return count
}
export function officialWorkingDays(year:number,month:number){
  const start=new Date(year,month-1,1),end=new Date(year,month,0)
  return businessDays(start,end,officialHolidays(year))
}
export function officialWorkedDays(year:number,month:number,reference=new Date()){
  const start=new Date(year,month-1,1),end=new Date(year,month,0)
  if(reference<start)return 0
  const through=reference>end?end:reference
  // Espelha a planilha oficial: NETWORKDAYS(início; hoje; feriados) - 1,
  // pois o dia corrente ainda não é considerado um dia concluído.
  return Math.max(0,businessDays(start,through,officialHolidays(year))-1)
}

function shift(y:number,m:number,o:number){const d=new Date(y,m-1+o,1);return[d.getFullYear(),d.getMonth()+1] as const}
export function sumMonth(s:State,y:number,m:number){return Object.values(s.historyByMonth?.[monthKey(y,m)]??{}).reduce((a:any,v:any)=>a+n(v),0) as number}
export function avg3(s:State){const a=[-1,-2,-3].map(o=>{const[y,m]=shift(s.periodYear,s.periodMonth,o);return sumMonth(s,y,m)}).filter(Boolean);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
export function avg3Pos(s:State){const a=[-1,-2,-3].map(o=>{const[y,m]=shift(s.periodYear,s.periodMonth,o);return n(s.historyMonthCounts?.[monthKey(y,m)])}).filter(Boolean);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
