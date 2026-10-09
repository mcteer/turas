import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import { gapListSchema, type GapContent } from '../../contracts/product-gaps';
import { HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import type { GapActor } from './policy';
import { gapHash } from './commands';
import { revisionHeader,gapRow,gapExpected } from './repository';
import {gapCountMetadata} from './counts';
import {gapRankingFactors} from './ranking';
import {compareGapRank} from '../../product-gaps/ranking';
import {createFencedGapVerifier} from './sources';
import { projectGapRevision } from './projection';

// This authoring registry exposes eligible narratives. Portfolio counts are a
// separate projection, never inferred from unreviewed working revisions.
export async function gapRegistry(db:PoolClient,actor:GapActor,input:z.infer<typeof gapListSchema>){
 const env=getServerConfig().TURAS_ENVIRONMENT_ID;
 const counts=await gapCountMetadata(db,actor,undefined,input.asOf?new Date(input.asOf):new Date(),[],input.comparisonAt?new Date(input.comparisonAt):undefined);
 const rows=counts.items.map(item=>item.record);
 const countMap=new Map(counts.items.map(item=>[item.id,item]));
 const headers=new Map<string,Awaited<ReturnType<typeof revisionHeader>>>();
 let generation='';
 const binding=gapHash({env,workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,filters:{...input,cursor:undefined}});
 const sign=(value:string)=>createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update(`gap-list-v1:${value}`).digest();
 let offset=0,priorGeneration:string|null=null;
 if(input.cursor){try{const [body,signature,...extra]=input.cursor.split('.'),expected=sign(body),actual=Buffer.from(signature,'base64url');if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();const cursor=JSON.parse(Buffer.from(body,'base64url').toString());if(cursor.binding!==binding||cursor.expiresAt<=Date.now()||!Number.isSafeInteger(cursor.offset)||cursor.offset<0||cursor.offset>2000)throw Error();offset=cursor.offset;priorGeneration=cursor.generation;}catch{throw new HttpFailure(409,'cursor_changed','Gap view changed; refresh the list');}}
 const result=[];
 for(const item of counts.items){const row=item.record,meta=item.head;
  if(!item.eligible||!meta)continue;
  if(input.disposition==='active'&&row.disposition==='dismissed'||!['active','all'].includes(input.disposition)&&row.disposition!==input.disposition)continue;
  if(input.customerId&&!item.sets.confirmed.includes(input.customerId)&&!item.sets.suspectedOnly.includes(input.customerId)&&!item.sets.resolvedHistory.includes(input.customerId))continue;
  const content=meta.fields as GapContent;
  if(content.kind!==input.kind||input.productKey&&content.productKey!==input.productKey||input.query&&!`${content.title} ${content.capability}`.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()))continue;
  const rank=gapRankingFactors(row,content,item.confirmed);
  result.push({id:row.id,version:Number(row.version),disposition:row.disposition,revisitAt:row.revisit_at?.toISOString()??null,reviewed:Boolean(row.reviewed_revision_id),counts:row.reviewed_revision_id?{confirmed:item.confirmed,suspectedOnly:item.suspectedOnly,resolvedHistory:item.resolvedHistory,methodVersion:counts.methodVersion}:null,ranking:row.reviewed_revision_id?rank:null,evidenceFreshness:item.evidenceFreshness,comparison:item.comparison,revisionId:meta.id});
 }
 result.sort((a,b)=>a.ranking&&b.ranking?compareGapRank(a.ranking.factors,b.ranking.factors):a.ranking?-1:b.ranking?1:a.id.localeCompare(b.id));
 generation=gapHash({source:counts.generation,eligible:result.map(r=>[r.id,r.revisionId,r.ranking])});
 if(priorGeneration!==null&&priorGeneration!==generation)throw new HttpFailure(409,'cursor_changed','Gap view changed; refresh the list');
 const selected=result.slice(offset,offset+input.limit),page=[],verifyFenced=await createFencedGapVerifier(db,actor);
 for(const item of selected){const header=await revisionHeader(db,actor,item.revisionId),projection=await projectGapRevision(db,actor,item.revisionId,false,header,verifyFenced);if(projection?.availability!=='eligible')throw new HttpFailure(409,'source_unavailable','Gap view changed; refresh the list');page.push({...item,revision:projection});}
 let nextCursor:string|null=null;
 if(result.length>offset+input.limit){const body=Buffer.from(JSON.stringify({binding,generation,offset:offset+input.limit,expiresAt:Date.now()+300000})).toString('base64url');nextCursor=`${body}.${sign(body).toString('base64url')}`;}
 return {contractVersion:'product-gaps-v1' as const,commandNamespace:gapHash([env,actor.workspaceId,actor.membershipId,actor.sessionId]),scopeGeneration:generation,items:page,nextCursor};
}
