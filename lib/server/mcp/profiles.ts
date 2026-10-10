import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { McpReadActor } from '../auth/read-actor';
import { mcpToolInputs,mcpProfileFactSchema,mcpContractVersion } from '../../contracts/mcp';
import { readAcceptedProfilePage } from '../profiles/read';
import { resolveMcpHandle,createMcpHandle } from './handles';
import { unavailableMcp } from './projections';
const timestamps=new Set(['observedAt','observationStart','observationEnd','reviewAt','startsAt','endsAt','effectiveAt','dueAt','completedAt']);
const privateKeys=new Set(['sourceMessageId','sourceSpanDigest','sourceUrl','sourceExcerpt','ownerReferenceId','recordReferenceId','referenceId']);
function payload(value:unknown):unknown{
  if(Array.isArray(value))return value.map(payload);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!privateKeys.has(key)).map(([key,value])=>[key,timestamps.has(key)&&typeof value==='string'?new Date(value).toISOString():payload(value)]));
}
export async function readMcpProfile(db:PoolClient,actor:McpReadActor,raw:unknown){
  const input=mcpToolInputs.turas_profile_read_v1.parse(raw),filterDigest=createHash('sha256').update(input.section).digest('hex');
  const cursor=input.cursor?await resolveMcpHandle(db,actor,input.cursor,{kind:'cursor',category:'profiles',customerId:input.customerId,section:input.section,filterDigest}):undefined;
  const page=await readAcceptedProfilePage(db,actor,input.customerId,input.section,input.limit??20,cursor?.positionId);
  if(cursor && cursor.generation!==page.generation)return unavailableMcp('source_changed');
  if(!page.items.length)return {contractVersion:mcpContractVersion,status:'empty',requestId:randomUUID(),data:{items:[]},nextCursor:null};
  const items=page.items.map(item=>mcpProfileFactSchema.parse({id:item.id,recordId:item.recordId,workloadId:item.workloadId,
    reviewState:'accepted',payload:payload(item.payload),quality:item.quality,createdAt:item.createdAt,supportStatus:item.supportStatus,
    ...(item.sourceAttestation?{sourceAttestation:item.sourceAttestation}:{})}));
  const nextCursor=page.nextPosition?await createMcpHandle(db,actor,{kind:'cursor',category:'profiles',customerId:input.customerId,
    section:input.section,filterDigest,positionId:page.nextPosition,generation:page.generation}):null;
  return {contractVersion:mcpContractVersion,status:'available',requestId:randomUUID(),data:{customerId:input.customerId,section:input.section,generation:page.generation,items},nextCursor};
}
