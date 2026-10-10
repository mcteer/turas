import { createHash,randomBytes,randomUUID,timingSafeEqual } from "node:crypto";
import { mcpBearerSchema,mcpCategorySchema } from "../../contracts/mcp";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { assertMcpReady } from "./schema";
import { lockWorkspaceActor } from "../profiles/policy";
import type { McpReadActor } from "../auth/read-actor";

export function newMcpCredential(){
  const id=randomUUID(),secret=randomBytes(32).toString('base64url');
  return {id,credential:`tmcp.${id}.${secret}`,hash:createHash('sha256').update(secret).digest('hex')};
}
export async function authenticateMcpBearer(authorization:string|null):Promise<McpReadActor>{
  const raw=authorization?.startsWith('Bearer ')?authorization.slice(7):'';
  if(!mcpBearerSchema.safeParse(raw).success)throw new HttpFailure(401,'unauthorized','Authentication required');
  const [,id,secret]=raw.split('.');
  return withTransaction(async db=>{
    await assertMcpReady(db,true);
    const row=(await db.query(`SELECT c.id,c.environment_id,c.workspace_id,c.principal_id,c.membership_id,c.categories,c.scope_digest,c.expires_at,c.revoked_at,c.credential_hash,
      p.login_name,p.display_name,m.kind,m.role FROM mcp_connections c
      JOIN principals p ON p.id=c.principal_id JOIN memberships m ON m.id=c.membership_id AND m.principal_id=c.principal_id AND m.workspace_id=c.workspace_id
      WHERE c.id=$1 AND c.environment_id=$2`,[id,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    const provided=createHash('sha256').update(secret).digest(),stored=Buffer.from(row?.credential_hash??'0'.repeat(64),'hex');
    if(stored.length!==32 || !timingSafeEqual(provided,stored) || !row || row.revoked_at || row.expires_at.getTime()<=Date.now() || !row.credential_hash)
      throw new HttpFailure(401,'unauthorized','Authentication required');
    const actor:McpReadActor={authority:'mcp',connectionId:row.id,environmentId:row.environment_id,workspaceId:row.workspace_id,
      principalId:row.principal_id,membershipId:row.membership_id,loginName:row.login_name,displayName:row.display_name,
      kind:row.kind,role:row.role,categories:mcpCategorySchema.array().parse(row.categories),scopeDigest:row.scope_digest,expiresAt:row.expires_at};
    await lockWorkspaceActor(db,actor,undefined,true,2000);
    return Object.freeze(actor);
  });
}
