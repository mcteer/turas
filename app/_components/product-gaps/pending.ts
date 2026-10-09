'use client';
import {z} from 'zod';
const pendingSchema=z.object({requestKey:z.uuid(),operation:z.string().min(1).max(40),recordId:z.uuid().nullable()}).strict();
export type PendingGap=z.infer<typeof pendingSchema>;
export function readPendingGap(namespace:string):PendingGap|null{try{const value=sessionStorage.getItem(`turas-gap-command:${namespace}`);return value&&value.length<=1024?pendingSchema.safeParse(JSON.parse(value)).data??null:null;}catch{return null;}}
export function writePendingGap(namespace:string,value:PendingGap|null){try{const key=`turas-gap-command:${namespace}`;if(value)sessionStorage.setItem(key,JSON.stringify(pendingSchema.parse(value)));else sessionStorage.removeItem(key);}catch{/* Keep the in-memory fence. */}}
export function requireGapReceipt(value:unknown,pending:PendingGap){const receipt=value as {id?:unknown;operation?:unknown;recordId?:unknown;version?:unknown};if(!z.uuid().safeParse(receipt?.id).success||receipt.operation!==pending.operation||pending.recordId&&receipt.recordId!==pending.recordId||typeof receipt.version!=='number'||!Number.isSafeInteger(receipt.version)||receipt.version<1)throw Error('Request remains unconfirmed; check its status.');}
