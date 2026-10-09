import {z} from 'zod';
import type {GapActor} from './policy';
import {withTransaction} from '../db/client';
import {lockGapActor} from './policy';
import {gapRead} from './commands';
import {lockGapCustomers} from './policy';
import {searchExpansionEvidence} from '../expansion/sources';
import {verifyGapSources} from './sources';
import {gapId,gapSourceSchema} from '../../contracts/product-gaps';
const querySchema=z.object({customerId:gapId,workloadId:gapId.optional(),query:z.string().trim().min(1).max(200),limit:z.coerce.number().int().min(1).max(10).default(10)}).strict();
export async function searchGapEvidence(actor:GapActor,raw:unknown){const input=querySchema.parse(raw);await gapRead(actor,db=>lockGapCustomers(db,actor,[input.customerId]));const found=await searchExpansionEvidence(actor,input.customerId,input.workloadId??null,input.query,input.limit);return withTransaction(async db=>{await lockGapActor(db,actor);const results=found.results.map(item=>{const {citationId,...reference}=item.reference as typeof item.reference & {citationId?:string};return {...item,reference:gapSourceSchema.parse({...reference,customerId:reference.kind==='shared_knowledge'?null:input.customerId,purpose:'corroboration'})};});await verifyGapSources(db,actor,results.map(r=>r.reference),{lock:true,max:200});return {results,warnings:found.warnings};});}
