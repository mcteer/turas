import {getServerConfig} from '../config';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {hiddenRecord,HttpFailure} from '../../contracts/http';
import {lockProfileActors} from '../profiles/policy';
import {historicalContentWithdrawn,type HistoricalSource} from '../retrieval/content-withdrawal';
export async function assertHistoricalNamedContentRetained(db:PoolClient,actor:CurrentSession,conversationId:string){
 const marker=Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0);
 if(marker!==80)throw new HttpFailure(503,'evidence_history_unavailable','Current source retention is unavailable');
 const coverage=(await db.query<{coverage:string|null}>(`SELECT coverage.coverage FROM conversations conversation LEFT JOIN ordinary_named_content_coverage coverage ON coverage.conversation_id=conversation.id
  WHERE conversation.id=$1 AND conversation.owner_principal_id=$2 AND conversation.workspace_id=$3 AND conversation.environment_id=$4`,[conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!coverage)throw hiddenRecord();
 if(coverage.coverage==='legacy_gap')throw new HttpFailure(409,'named_content_legacy_gap','Start a new conversation for current evidence');
 if(coverage.coverage!=='complete')throw new HttpFailure(503,'evidence_history_unavailable','Current source retention is unavailable');
 const rows=(await db.query<{customer_id:string|null;citation_id:string}>(`SELECT DISTINCT dependency.customer_id,dependency.citation_id
  FROM ordinary_named_content_dependencies dependency JOIN conversations conversation ON conversation.id=dependency.conversation_id
  WHERE conversation.id=$1 AND conversation.owner_principal_id=$2 AND conversation.workspace_id=$3 AND conversation.environment_id=$4
  ORDER BY dependency.customer_id,dependency.citation_id LIMIT 1001`,[conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
 if(rows.length>1000)throw new HttpFailure(422,'scope_too_large','Start a new conversation for current evidence');
 await lockProfileActors(db,actor,[...new Set(rows.flatMap(row=>row.customer_id?[row.customer_id]:[]))],undefined,true);
 const roots:HistoricalSource[]=rows.map(row=>{const split=row.citation_id.indexOf(':'),kind=row.citation_id.slice(0,split),id=row.citation_id.slice(split+1);return{kind:kind==='accepted_manual'?'accepted_profile':kind==='attributed_research'?'verified_research':kind,id,workspaceId:actor.workspaceId,customerId:row.customer_id};});
 if(await historicalContentWithdrawn(db,roots))throw hiddenRecord();
}
