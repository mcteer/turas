import { createHash } from "node:crypto";
import {AsyncLocalStorage} from "node:async_hooks";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/client";
import { HttpFailure } from "../../contracts/http";
export function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value!==null&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value)??"null";
}
export const partnerHash=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
const transactionCache=new AsyncLocalStorage<{db:PoolClient;values:Map<string,unknown>}>();
export function partnerCached<T>(db:PoolClient,key:string):T|undefined{const cache=transactionCache.getStore();return cache?.db===db?cache.values.get(key) as T|undefined:undefined;}
export function cachePartnerValue(db:PoolClient,key:string,value:unknown){const cache=transactionCache.getStore();if(cache?.db===db&&cache.values.size<100)cache.values.set(key,value);}
export async function partnerTransaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
  return withTransaction(db=>transactionCache.run({db,values:new Map()},async()=>{await db.query("SET LOCAL transaction_timeout='10s'");await db.query("SET LOCAL turas.partner_operation='013'");await db.query("SET LOCAL lock_timeout='2s'");return run(db);}));
}
export function expectPartnerVersion(actual:unknown,expected:number){if(Number(actual)!==expected)throw new HttpFailure(409,"stale_version","This record changed; reload before continuing");}
