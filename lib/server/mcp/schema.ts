import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";

export const mcpTables = Object.freeze(["mcp_connections","mcp_connection_customers","mcp_handles","mcp_rate_windows",
  "mcp_read_leases","mcp_management_receipts","mcp_access_receipts","mcp_management_cursors"]);
export async function assertMcpReady(db:PoolClient,exposure=false):Promise<void> {
  if(exposure && getServerConfig().TURAS_015_DISABLED!=="0")throw new HttpFailure(503,"unavailable","Service unavailable");
  const marker=(await db.query("SELECT environment_id,schema_version FROM turas_environment LIMIT 1")).rows[0];
  if(marker?.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID || Number(marker.schema_version)<55)
    throw new HttpFailure(503,"unavailable","Service unavailable");
  const grants=await db.query<{ready:boolean}>(`SELECT bool_and(to_regclass('public.'||name) IS NOT NULL
    AND has_table_privilege(current_user,'public.'||name,'SELECT,INSERT')) AS ready FROM unnest($1::text[]) AS name`,[mcpTables]);
  if(grants.rows[0]?.ready!==true)throw new HttpFailure(503,"unavailable","Service unavailable");
  const writes=(await db.query<{ready:boolean}>(`SELECT
    has_column_privilege(current_user,'mcp_connections','credential_hash','UPDATE') AND
    has_column_privilege(current_user,'mcp_connections','revoked_at','UPDATE') AND
    has_column_privilege(current_user,'mcp_connections','revoker_membership_id','UPDATE') AND
    has_column_privilege(current_user,'mcp_connections','last_used_at','UPDATE') AND
    has_column_privilege(current_user,'mcp_connection_customers','customer_id','UPDATE') AND
    has_column_privilege(current_user,'mcp_rate_windows','count','UPDATE') AND
    has_table_privilege(current_user,'mcp_handles','DELETE') AND
    has_table_privilege(current_user,'mcp_rate_windows','DELETE') AND
    has_table_privilege(current_user,'mcp_read_leases','DELETE') AND
    has_table_privilege(current_user,'mcp_management_cursors','DELETE') AND
    has_table_privilege(current_user,'mcp_access_receipts','DELETE') AS ready`)).rows[0];
  if(writes?.ready!==true)throw new HttpFailure(503,"unavailable","Service unavailable");
}
