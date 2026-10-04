export function canonicalReportJson(value:unknown):string{
 function normalized(value:unknown):unknown{
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(normalized);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>[key,normalized(child)]));
  return value;
 }return JSON.stringify(normalized(value));
}
