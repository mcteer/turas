"use client";
import {z} from 'zod';
import {expansionId} from '../../../lib/contracts/expansion';
const schema=z.object({requestKey:expansionId,operation:z.enum(['save_hypothesis','save_suggestion','assign_owner','decide_hypothesis']),workloadId:expansionId.nullable(),recordId:expansionId.optional()}).strict();
export type PendingExpansionCommand=z.infer<typeof schema>;
export type ExpansionPendingManager={blocked:boolean;begin:(command:PendingExpansionCommand)=>boolean;finish:(requestKey:string)=>void};
/** Only opaque identities are retained; no draft, evidence, rationale or credentials. */
export function readPendingExpansion(namespace:string):PendingExpansionCommand|null{
 try{const raw=sessionStorage.getItem(`turas-expansion-command:${namespace}`);if(!raw||raw.length>1024)return null;return schema.safeParse(JSON.parse(raw)).data??null;}catch{return null;}
}
export function writePendingExpansion(namespace:string,command:PendingExpansionCommand|null){
 try{const name=`turas-expansion-command:${namespace}`;if(command)sessionStorage.setItem(name,JSON.stringify(schema.parse(command)));else sessionStorage.removeItem(name);}catch{/* The in-memory fence remains active when browser storage is unavailable. */}
}
export function pendingExpansionLabel(command:PendingExpansionCommand){return command.operation==='assign_owner'?'Check Assignment Status':command.operation==='decide_hypothesis'?'Check Decision Status':'Check Save Status';}

export function requirePendingReceipt(data:unknown,command:PendingExpansionCommand,customerId:string){
 const value=data as {receipt?:{id?:unknown;customerId?:unknown;operation?:unknown;recordId?:unknown;version?:unknown}}|null;
 const receipt=value?.receipt;
 if(!receipt||typeof receipt.id!=='string'||!expansionId.safeParse(receipt.id).success||receipt.customerId!==customerId||receipt.operation!==command.operation||
  command.recordId&&receipt.recordId!==command.recordId||typeof receipt.version!=='number'||!Number.isSafeInteger(receipt.version)||receipt.version<0)
  throw Error('Command remains unconfirmed. Check its status before continuing.');
}
