import type { PoolClient } from "pg";
import type { McpReadActor } from "../auth/read-actor";
import type { McpCategory } from "../../contracts/mcp";
import { lockProfileActor,lockWorkspaceActor } from "../profiles/policy";
import { HttpFailure } from "../../contracts/http";

export async function requireMcpScope(db:PoolClient,actor:McpReadActor,category?:McpCategory,customerId?:string):Promise<void>{
  if(customerId)await lockProfileActor(db,actor,customerId,undefined,true);
  else await lockWorkspaceActor(db,actor,undefined,true,2000);
  if(category){
    const allowed=await db.query("SELECT id FROM mcp_connections WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND $4=ANY(categories)",[actor.connectionId,actor.environmentId,actor.workspaceId,category]);
    if(!allowed.rowCount)throw new HttpFailure(403,"forbidden","Scope not allowed");
  }
}
