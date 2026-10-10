import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { McpReadActor } from "../auth/read-actor";
import { lockWorkspaceActor } from "../profiles/policy";
import { withTransaction,query } from "../db/client";
import { HttpFailure } from "../../contracts/http";

export type McpLease = Readonly<{id:string;environmentId:string;workspaceId:string;connectionId:string}>;
/** A separate committed transaction; never accept a caller's read transaction. */
export async function admitMcpRequest(actor:McpReadActor):Promise<McpLease> {
  const result=await withTransaction(async db=>{
    await db.query("SET LOCAL lock_timeout='2000ms'");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,15))",[actor.environmentId+':'+actor.workspaceId]);
    await lockWorkspaceActor(db,actor,undefined,true,2000);
    const clock=(await db.query<{at:Date;window:Date;retry:number}>("SELECT clock_timestamp() AS at,date_trunc('minute',clock_timestamp()) AS window,ceil(60-extract(second FROM clock_timestamp()))::integer AS retry")).rows[0];
    const scopes=[['connection',actor.connectionId,30],['member',actor.membershipId,60],['workspace',actor.workspaceId,240]] as const;
    let limited=false;
    for(const [bucket,subject,maximum] of scopes){
      const row=(await db.query<{count:number}>(`INSERT INTO mcp_rate_windows(environment_id,workspace_id,bucket,subject_id,window_start,count)
        VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(environment_id,workspace_id,bucket,subject_id,window_start)
        DO UPDATE SET count=least(mcp_rate_windows.count+1,$6) RETURNING count`,[actor.environmentId,actor.workspaceId,bucket,subject,clock.window,maximum+1])).rows[0];
      if(row.count>maximum)limited=true;
    }
    if(limited)return {limited:true as const,retry:Math.max(1,Math.min(60,clock.retry))};
    const concurrent=(await db.query<{connection:number;member:number;workspace:number;retry:number|null}>(`SELECT
      count(*) FILTER(WHERE connection_id=$3)::integer AS connection,
      count(*) FILTER(WHERE membership_id=$4)::integer AS member,count(*)::integer AS workspace,
      ceil(extract(epoch FROM min(expires_at)-$5::timestamptz))::integer AS retry
      FROM mcp_read_leases WHERE environment_id=$1 AND workspace_id=$2 AND expires_at>$5`,[actor.environmentId,actor.workspaceId,actor.connectionId,actor.membershipId,clock.at])).rows[0];
    if(concurrent.connection>=2 || concurrent.member>=4 || concurrent.workspace>=16)
      return {limited:true as const,retry:Math.max(1,Math.min(60,concurrent.retry??1))};
    const id=randomUUID();
    await db.query(`INSERT INTO mcp_read_leases(id,environment_id,workspace_id,principal_id,membership_id,connection_id,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$7::timestamptz+interval '10 seconds')`,[id,actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,actor.connectionId,clock.at]);
    return {limited:false as const,lease:{id,environmentId:actor.environmentId,workspaceId:actor.workspaceId,connectionId:actor.connectionId}};
  });
  if(result.limited)throw new HttpFailure(429,"limited","Request limit reached",result.retry);
  return Object.freeze(result.lease);
}
export async function releaseMcpLease(lease:McpLease):Promise<void>{
  await query("DELETE FROM mcp_read_leases WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND connection_id=$4",[lease.id,lease.environmentId,lease.workspaceId,lease.connectionId]);
}

/** Management admission precedes the browser management transaction as well. */
export async function admitMcpManagement(db:PoolClient,environmentId:string,workspaceId:string,membershipId:string):Promise<boolean>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,15))",[environmentId+':'+workspaceId]);
  let allowed=true;
  for(const [bucket,subject,maximum] of [['management_member',membershipId,10],['management_workspace',workspaceId,60]] as const){
    const row=(await db.query<{count:number}>(`INSERT INTO mcp_rate_windows(environment_id,workspace_id,bucket,subject_id,window_start,count)
      VALUES($1,$2,$3,$4,date_trunc('minute',clock_timestamp()),1)
      ON CONFLICT(environment_id,workspace_id,bucket,subject_id,window_start) DO UPDATE SET count=least(mcp_rate_windows.count+1,$5) RETURNING count`,[environmentId,workspaceId,bucket,subject,maximum+1])).rows[0];
    if(row.count>maximum)allowed=false;
  }
  return allowed;
}
