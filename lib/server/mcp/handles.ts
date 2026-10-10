import { createHash,randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { McpReadActor } from '../auth/read-actor';
import type { McpCategory } from '../../contracts/mcp';
import { HttpFailure } from '../../contracts/http';
import { requireMcpScope } from './policy';
export type McpHandleBinding={kind:'cursor'|'citation';category:McpCategory;customerId?:string;section:string;filterDigest:string;
  positionId?:string;revisionId?:string;generation?:number;passageId?:string;contentDigest?:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function createMcpHandle(db:PoolClient,actor:McpReadActor,binding:McpHandleBinding):Promise<string>{
  await requireMcpScope(db,actor,binding.category,binding.customerId);
  const handle=randomBytes(32).toString('base64url');
  await db.query(`WITH timing AS MATERIALIZED(SELECT clock_timestamp() AS at)
    INSERT INTO mcp_handles(handle_hash,kind,environment_id,workspace_id,principal_id,membership_id,connection_id,category,customer_id,section,scope_digest,filter_digest,position_id,revision_id,generation,passage_id,content_digest,created_at,expires_at)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,at,least(at+interval '15 minutes',$18::timestamptz) FROM timing`,
    [hash(handle),binding.kind,actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,actor.connectionId,binding.category,binding.customerId??null,binding.section,actor.scopeDigest,binding.filterDigest,binding.positionId??null,binding.revisionId??null,binding.generation??null,binding.passageId??null,binding.contentDigest??null,actor.expiresAt]);
  return handle;
}
export async function resolveMcpHandle(db:PoolClient,actor:McpReadActor,handle:string,expected:{kind:'cursor'|'citation';category?:McpCategory;customerId?:string;section?:string;filterDigest?:string}):Promise<McpHandleBinding>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(handle))throw new HttpFailure(422,'invalid_input','Invalid handle');
  const row=(await db.query(`SELECT kind,category,customer_id,section,filter_digest,position_id,revision_id,generation,passage_id,content_digest FROM mcp_handles
    WHERE handle_hash=$1 AND environment_id=$2 AND workspace_id=$3 AND principal_id=$4 AND membership_id=$5 AND connection_id=$6 AND scope_digest=$7 AND expires_at>clock_timestamp()`,
    [hash(handle),actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,actor.connectionId,actor.scopeDigest])).rows[0];
  if(!row || row.kind!==expected.kind || (expected.category!==undefined&&row.category!==expected.category) ||
    (expected.customerId!==undefined&&row.customer_id!==expected.customerId) || (expected.section!==undefined&&row.section!==expected.section) ||
    (expected.filterDigest!==undefined&&row.filter_digest!==expected.filterDigest))throw new HttpFailure(422,'invalid_input','Invalid handle');
  await requireMcpScope(db,actor,row.category,row.customer_id??undefined);
  return {kind:row.kind,category:row.category,customerId:row.customer_id??undefined,section:row.section,filterDigest:row.filter_digest,
    positionId:row.position_id??undefined,revisionId:row.revision_id??undefined,generation:row.generation?Number(row.generation):undefined,
    passageId:row.passage_id??undefined,contentDigest:row.content_digest??undefined};
}
