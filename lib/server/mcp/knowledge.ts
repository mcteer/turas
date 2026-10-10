import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { McpReadActor } from '../auth/read-actor';
import { mcpToolInputs,mcpKnowledgeSchema,mcpContractVersion } from '../../contracts/mcp';
import { currentKnowledgeHeaders,readCurrentKnowledge,type CurrentKnowledgeHeader } from '../knowledge/read';
import { createMcpHandle,resolveMcpHandle,type McpHandleBinding } from './handles';
import { unavailableMcp } from './projections';
import { requireMcpScope } from './policy';
const filterDigest=createHash('sha256').update('shared-publications-v1').digest('hex');
const envelope=<T>(data:T,status:'available'|'empty'='available',nextCursor:string|null=null)=>({contractVersion:mcpContractVersion,status,requestId:randomUUID(),data,nextCursor});
async function publication(db:PoolClient,actor:McpReadActor,header:CurrentKnowledgeHeader){
  const dto=await readCurrentKnowledge(db,actor,header);if(!dto)return null;
  const citationHandle=await createMcpHandle(db,actor,{kind:'citation',category:'knowledge',section:'publication',filterDigest,
    positionId:header.id,revisionId:header.revision_id,generation:Number(header.head_generation),contentDigest:header.content_digest});
  const {rationale:omittedRationale,...quality}=dto.quality;
  return mcpKnowledgeSchema.parse({publicationId:header.id,revisionId:header.revision_id,generation:Number(header.head_generation),
    digest:header.content_digest,payload:dto.payload,quality,publishedAt:dto.publishedAt,citationHandle,caveats:dto.caveats});
}
export async function listMcpKnowledge(db:PoolClient,actor:McpReadActor,raw:unknown){
  const input=mcpToolInputs.turas_knowledge_list_v1.parse(raw);await requireMcpScope(db,actor,'knowledge');
  const cursor=input.cursor?await resolveMcpHandle(db,actor,input.cursor,{kind:'cursor',category:'knowledge',section:'publications',filterDigest}):undefined;
  const snapshot=(await db.query<{digest:string}>(`SELECT encode(sha256(convert_to(coalesce(string_agg(
    concat_ws(':',id,revision_id,head_generation,state,updated_at),'|' ORDER BY id),''),'UTF8')),'hex') AS digest
    FROM knowledge_publications WHERE environment_id=$1`,[actor.environmentId])).rows[0].digest;
  if(cursor && cursor.contentDigest!==snapshot)return unavailableMcp('source_changed');
  const candidates=await currentKnowledgeHeaders(db,actor,cursor?.positionId),items=[];
  let last:string|undefined,more=false;
  for(const header of candidates.slice(0,100)){
    const dto=await publication(db,actor,header);
    if(dto){if(items.length===input.limit){more=true;break;}const {payload,...summary}=dto;items.push(summary);}
    last=header.id;
  }
  if(candidates.length>100&&!more)return unavailableMcp('incomplete');
  const nextCursor=more&&last?await createMcpHandle(db,actor,{kind:'cursor',category:'knowledge',section:'publications',filterDigest,
    positionId:last,contentDigest:snapshot}):null;
  return envelope({items},items.length?'available':'empty',nextCursor);
}
export async function readMcpKnowledge(db:PoolClient,actor:McpReadActor,raw:unknown,binding?:McpHandleBinding){
  const input=mcpToolInputs.turas_knowledge_read_v1.parse(raw);await requireMcpScope(db,actor,'knowledge');
  const header=(await currentKnowledgeHeaders(db,actor,undefined,input.publicationId))[0];
  if(!header)return unavailableMcp('not_found');
  if((input.expectedRevisionId&&input.expectedRevisionId!==header.revision_id) || (binding &&
    (binding.revisionId!==header.revision_id || binding.generation!==Number(header.head_generation) || binding.contentDigest!==header.content_digest)))return unavailableMcp('source_changed');
  const data=await publication(db,actor,header);return data?envelope(data):unavailableMcp('source_changed');
}
