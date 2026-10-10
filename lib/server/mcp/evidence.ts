import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { McpReadActor } from '../auth/read-actor';
import { mcpToolInputs,mcpEvidenceSchema,mcpContractVersion } from '../../contracts/mcp';
import { authorizeRetrievalScope,recheckRetrievalSource } from '../retrieval/policy';
import { confirmedConflictAfter } from '../retrieval/fences';
import { buildCurrentProjection,projectionContract,projectionContractDigest } from '../retrieval/projections';
import { collapseDuplicateChunks,passageDigest } from '../retrieval/chunker';
import { currentFactEligible } from '../retrieval/context';
import { readRetrievalQuality } from '../retrieval/quality-read';
import { unsupportedProfileRevisionIds } from '../profiles/eligibility';
import { lockOriginalHeader } from '../plans/sources';
import { createMcpHandle,resolveMcpHandle,type McpHandleBinding } from './handles';
import { requireMcpScope } from './policy';
import { unavailableMcp } from './projections';
import { readMcpKnowledge } from './knowledge';
import {lockLearningOriginalClosure} from '../learning/sources';
type Kind='accepted_profile'|'approved_excerpt'|'verified_research';
type Header={id:string;source_kind:Kind;source_revision_id:string;source_generation:string;audience:'internal'|'delivery';content_digest:string;
  projection_contract:string;contract_digest:string;passage_id:string;passage_digest:string};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const envelope=<T>(data:T,status:'available'|'empty'='available',nextCursor:string|null=null)=>({contractVersion:mcpContractVersion,status,requestId:randomUUID(),data,nextCursor});

/** Metadata first; source policy and original locks precede any projected prose. */
async function eligible(db:PoolClient,actor:McpReadActor,customerId:string,row:Header){
  const scope=await authorizeRetrievalScope(db,actor,'customer',customerId,undefined,true);
  if(row.projection_contract!==projectionContract || row.contract_digest!==projectionContractDigest)return null;
  await lockOriginalHeader(db,row.source_kind,row.source_revision_id);
  await lockLearningOriginalClosure(db,actor.workspaceId,customerId,[{sourceKind:row.source_kind,sourceRevisionId:row.source_revision_id}]);
  if(!await recheckRetrievalSource(db,{id:row.id,kind:row.source_kind,revisionId:row.source_revision_id,
    generation:Number(row.source_generation),audience:row.audience,contentDigest:row.content_digest,projectionContract:row.projection_contract},scope))return null;
  if(await confirmedConflictAfter(db,row.source_kind,row.source_revision_id,new Date(0)))return null;
  // The existing internal reader may inspect commercial/personnel context. MCP may not.
  let profileId:string|undefined;
  if(row.source_kind==='accepted_profile')profileId=row.source_revision_id;
  if(row.source_kind==='approved_excerpt')profileId=(await db.query<{profile_revision_id:string}>(
    'SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1',[row.source_revision_id])).rows[0]?.profile_revision_id;
  if(profileId){
    const root=(await db.query<{data_category:string}>('SELECT data_category FROM profile_revisions WHERE id=$1',[profileId])).rows[0];
    if(!root || ['commercial','personnel'].includes(root.data_category) ||
      (await unsupportedProfileRevisionIds(db,[profileId],true,undefined,['commercial','personnel'])).has(profileId))return null;
  }
  const quality=await readRetrievalQuality(db,row,new Date());
  if(!currentFactEligible(quality))return null;
  return quality;
}
async function headers(db:PoolClient,actor:McpReadActor,customerId:string,options:{workloadId?:string;revisionId?:string;passageId?:string;after?:string}={}){
  await requireMcpScope(db,actor,'evidence',customerId);
  return (await db.query<Header>(`SELECT s.id,s.source_kind,s.source_revision_id,s.source_generation,s.audience,s.content_digest,
    s.projection_contract,s.contract_digest,p.id AS passage_id,p.passage_digest
    FROM retrieval_sources s JOIN retrieval_passages p ON p.source_id=s.id
    WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.customer_id=$3 AND s.scope='customer'
      AND s.lifecycle_state='current' AND s.source_kind IN ('accepted_profile','approved_excerpt','verified_research')
      AND (s.audience='delivery' OR $4='internal')
      AND NOT ($4='internal' AND s.audience='delivery' AND EXISTS (SELECT 1 FROM retrieval_sources preferred
        WHERE preferred.environment_id=s.environment_id AND preferred.workspace_id=s.workspace_id AND preferred.customer_id=s.customer_id
          AND preferred.source_kind=s.source_kind AND preferred.source_revision_id=s.source_revision_id
          AND preferred.source_generation=s.source_generation AND preferred.audience='internal' AND preferred.lifecycle_state='current'))
      AND ($5::uuid IS NULL OR s.workload_id=$5)
      AND ($6::uuid IS NULL OR s.source_revision_id=$6) AND ($7::uuid IS NULL OR p.id=$7)
      AND ($8::uuid IS NULL OR p.id>$8) ORDER BY p.id LIMIT 101 FOR SHARE OF s,p`,
    [actor.environmentId,actor.workspaceId,customerId,actor.kind==='internal'?'internal':'delivery',options.workloadId??null,
      options.revisionId??null,options.passageId??null,options.after??null])).rows;
}
async function projectPassage(db:PoolClient,actor:McpReadActor,customerId:string,row:Header){
  const quality=await eligible(db,actor,customerId,row);if(!quality)return null;
  const candidate=await buildCurrentProjection(db,row.source_kind,row.source_revision_id,row.audience,actor.environmentId);
  if(!candidate || candidate.generation!==Number(row.source_generation))return null;
  const chunks=collapseDuplicateChunks(candidate.chunks);
  if(digest(chunks.map(chunk=>({digest:chunk.digest,locators:chunk.locators,warnings:chunk.warnings})))!==row.content_digest)return null;
  const passage=(await db.query<{passage_text:string;locators:unknown;extraction_warnings:unknown}>(
    'SELECT passage_text,locators,extraction_warnings FROM retrieval_passages WHERE id=$1 AND source_id=$2 AND passage_digest=$3',
    [row.passage_id,row.id,row.passage_digest])).rows[0];
  if(!passage || passageDigest(passage.passage_text)!==row.passage_digest || !chunks.some(chunk=>chunk.digest===row.passage_digest &&
    chunk.text===passage.passage_text && digest(chunk.locators)===digest(passage.locators)))return null;
  if(Array.isArray(passage.locators) && passage.locators.some(locator=>locator.kind==='profile_field' &&
    /(^|\.)(sourceExcerpt|sourceUrl|sourceMessageId|sourceSpanDigest|ownerReferenceId|recordReferenceId|referenceId)(\.|$)/.test(locator.fieldPath)))return null;
  const dates=row.source_kind==='verified_research'?(await db.query<{title:string;publication_at:Date|null;observation_at:Date|null;retrieved_at:Date|null}>(
    'SELECT title,publication_at,observation_at,retrieval_at AS retrieved_at FROM evidence_source_revisions WHERE id=$1',[row.source_revision_id])).rows[0]:undefined;
  const profileDates=row.source_kind!=='verified_research'?(await db.query<{payload:Record<string,unknown>}>(`SELECT payload FROM profile_revisions
    WHERE id=${row.source_kind==='approved_excerpt'?'(SELECT profile_revision_id FROM artifact_evidence_selections WHERE id=$1)':'$1'}`,[row.source_revision_id])).rows[0]?.payload:undefined;
  const observed=profileDates?.observedAt??profileDates?.observationEnd;
  const observationAt=dates?.observation_at?.toISOString()??(typeof observed==='string'?new Date(observed).toISOString():null);
  const {rationale:omittedRationale,...publicQuality}=quality;
  const citationHandle=await createMcpHandle(db,actor,{kind:'citation',category:'evidence',customerId,section:'passage',filterDigest:digest({sourceId:row.id}),
    positionId:row.id,revisionId:row.source_revision_id,generation:Number(row.source_generation),passageId:row.passage_id,contentDigest:row.passage_digest});
  return mcpEvidenceSchema.parse({revisionId:row.source_revision_id,generation:Number(row.source_generation),digest:row.content_digest,
    passageId:row.passage_id,sourceKind:row.source_kind,title:dates?.title??'Accepted delivery evidence',text:passage.passage_text,
    locators:passage.locators,quality:publicQuality,publicationAt:dates?.publication_at?.toISOString()??null,
    observationAt,retrievedAt:dates?.retrieved_at?.toISOString()??null,
    acceptance:'accepted',conflict:'none',citationHandle,caveats:passage.extraction_warnings});
}
export async function listMcpEvidence(db:PoolClient,actor:McpReadActor,raw:unknown){
  const input=mcpToolInputs.turas_evidence_list_v1.parse(raw),filterDigest=digest({workloadId:input.workloadId??null});
  await requireMcpScope(db,actor,'evidence',input.customerId);
  const cursor=input.cursor?await resolveMcpHandle(db,actor,input.cursor,{kind:'cursor',category:'evidence',customerId:input.customerId,section:'evidence',filterDigest}):undefined;
  const state=(await db.query<{generation:string;digest:string}>(`SELECT greatest(${actor.kind==='internal'?'internal_generation':'delivery_generation'},1) AS generation,
    encode(sha256(convert_to(concat_ws(':',${actor.kind==='internal'?'internal_generation':'delivery_generation'}::text,
      (SELECT string_agg(concat_ws(':',id,source_revision_id,source_generation,content_digest,lifecycle_state,updated_at),'|' ORDER BY id)
        FROM retrieval_sources WHERE environment_id=$3 AND workspace_id=$1 AND customer_id=$2),
      (SELECT string_agg(concat_ws(':',e.id,e.event_type,e.created_at),'|' ORDER BY e.id) FROM evidence_source_events e
        JOIN evidence_source_revisions r ON r.id=e.source_revision_id WHERE r.workspace_id=$1 AND r.customer_id=$2),
      (SELECT string_agg(concat_ws(':',id,state,updated_at),'|' ORDER BY id) FROM evidence_conflict_targets
        WHERE environment_id=$3 AND workspace_id=$1 AND customer_id=$2)), 'UTF8')),'hex') AS digest
    FROM customer_profile_state WHERE workspace_id=$1 AND customer_id=$2`,[actor.workspaceId,input.customerId,actor.environmentId])).rows[0];
  if(!state)return unavailableMcp('unavailable');
  const generation=Number(state.generation);
  if(cursor && (cursor.generation!==generation || cursor.contentDigest!==state.digest))return unavailableMcp('source_changed');
  const candidates=await headers(db,actor,input.customerId,{workloadId:input.workloadId,after:cursor?.positionId});
  const items=[];let last:string|undefined,more=false;
  for(const row of candidates.slice(0,100)){
    const passage=await projectPassage(db,actor,input.customerId,row);
    if(passage){if(items.length===input.limit){more=true;break;}const {text,locators,...summary}=passage;items.push(summary);}
    last=row.passage_id;
  }
  if(candidates.length>100 && !more)return unavailableMcp('incomplete');
  const nextCursor=more&&last?await createMcpHandle(db,actor,{kind:'cursor',category:'evidence',customerId:input.customerId,
    section:'evidence',filterDigest,positionId:last,generation,contentDigest:state.digest}):null;
  return envelope({items},items.length?'available':'empty',nextCursor);
}
export async function readMcpEvidence(db:PoolClient,actor:McpReadActor,raw:unknown,binding?:McpHandleBinding){
  const input=mcpToolInputs.turas_evidence_read_v1.parse(raw);
  const row=(await headers(db,actor,input.customerId,{revisionId:input.revisionId,passageId:input.passageId}))[0];
  if(!row)return unavailableMcp('not_found');
  if(binding && (binding.positionId!==row.id || binding.generation!==Number(row.source_generation) || binding.contentDigest!==row.passage_digest))return unavailableMcp('source_changed');
  const data=await projectPassage(db,actor,input.customerId,row);
  return data?envelope(data):unavailableMcp('source_changed');
}
export async function resolveMcpCitation(db:PoolClient,actor:McpReadActor,raw:unknown){
  const input=mcpToolInputs.turas_citation_resolve_v1.parse(raw),binding=await resolveMcpHandle(db,actor,input.citationHandle,{kind:'citation'});
  if(binding.category==='knowledge' && binding.positionId)return readMcpKnowledge(db,actor,{publicationId:binding.positionId},binding);
  if(binding.category!=='evidence' || !binding.customerId || !binding.revisionId || !binding.passageId)return unavailableMcp('unavailable');
  return readMcpEvidence(db,actor,{customerId:binding.customerId,revisionId:binding.revisionId,passageId:binding.passageId},binding);
}
