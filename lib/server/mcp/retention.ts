import type { PoolClient } from 'pg';
import { getServerConfig } from '../config';
import { withTransaction } from '../db/client';
import { assertMcpReady } from './schema';
/** Each delete/update statement owns at most 100 rows. Exposure disablement
 * never disables cleanup, and receipts/connection identities are retained. */
export async function cleanupMcpMetadata(db:PoolClient){
 await assertMcpReady(db);const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;let processed=0;
 for(const table of ['mcp_handles','mcp_management_cursors','mcp_read_leases'] as const){
  const result=await db.query(`DELETE FROM ${table} WHERE ctid IN(SELECT ctid FROM ${table}
    WHERE environment_id=$1 AND expires_at<=clock_timestamp() ORDER BY expires_at LIMIT 100)`,[environmentId]);processed+=result.rowCount??0;
 }
 const audits=await db.query(`DELETE FROM mcp_access_receipts WHERE id IN(SELECT id FROM mcp_access_receipts
   WHERE environment_id=$1 AND created_at<=clock_timestamp()-interval '90 days' ORDER BY created_at,id LIMIT 100)`,[environmentId]);processed+=audits.rowCount??0;
 const rates=await db.query(`DELETE FROM mcp_rate_windows WHERE ctid IN(SELECT ctid FROM mcp_rate_windows
   WHERE environment_id=$1 AND window_start<date_trunc('minute',clock_timestamp())-interval '1 minute' ORDER BY window_start LIMIT 100)`,[environmentId]);processed+=rates.rowCount??0;
 const hashes=await db.query(`UPDATE mcp_connections SET credential_hash=NULL WHERE id IN(SELECT id FROM mcp_connections
   WHERE environment_id=$1 AND credential_hash IS NOT NULL AND (revoked_at IS NOT NULL OR expires_at<=clock_timestamp())
   ORDER BY coalesce(revoked_at,expires_at),id LIMIT 100)`,[environmentId]);processed+=hashes.rowCount??0;
 return {processed};
}
export async function runMcpMaintenanceTick(){
 return withTransaction(async db=>{
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment LIMIT 1')).rows[0];
  if(marker?.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID||Number(marker.schema_version)<55)return {processed:0};
  return cleanupMcpMetadata(db);
 });
}
