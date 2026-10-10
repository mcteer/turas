import type { McpReadActor } from '../auth/read-actor';
import { mcpUsageSchema } from '../../contracts/mcp';
import { withTransaction } from '../db/client';
import { assertMcpReady } from './schema';
const receipt=mcpUsageSchema.omit({createdAt:true});
export type McpAuditInput=import('zod').infer<typeof receipt>;
/** Fixed metadata only. Deliberately accepts no arguments, source coordinates,
 * customer names, prose or credentials; uncertain writes are never retried. */
export async function recordMcpAccess(actor:McpReadActor,input:McpAuditInput){
 const safe=receipt.parse(input);
 await withTransaction(async db=>{
  await db.query("SET LOCAL lock_timeout='200ms'");await db.query("SET LOCAL statement_timeout='1000ms'");
  await assertMcpReady(db);
  await db.query(`INSERT INTO mcp_access_receipts(id,connection_id,environment_id,workspace_id,principal_id,membership_id,operation,result,duration_ms)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[safe.requestId,actor.connectionId,actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,safe.operation,safe.result,safe.durationMs]);
  if(safe.result==='available'||safe.result==='empty')await db.query(`UPDATE mcp_connections SET last_used_at=clock_timestamp()
   WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND principal_id=$4 AND membership_id=$5
    AND revoked_at IS NULL AND expires_at>clock_timestamp()`,[actor.connectionId,actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId]);
 });
}
