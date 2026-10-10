import { describe,expect,it } from "vitest";
import { mcpFixture,withMcpDatabase } from "../../fixtures/mcp/setup";
import { lockProfileActor,lockWorkspaceActor,requireSteward } from "../../../lib/server/profiles/policy";
import { withTransaction } from "../../../lib/server/db/client";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { requirePlanCapability } from "../../../lib/server/plans/policy";
import { requireReportCapability } from "../../../lib/server/reports/policy";
describe("MCP independent current authority",()=>{
  it("keeps MCP valid after browser logout but rejects browser reuse",async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db);
    await withTransaction(client=>lockProfileActor(client,browser,customerId,undefined,true));
    await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1",[browser.sessionId]);
    await withTransaction(client=>lockProfileActor(client,actor,customerId,undefined,true));
    await expect(withTransaction(client=>lockProfileActor(client,browser,customerId,undefined,true))).rejects.toMatchObject({status:401});
  }));
  it("cannot enter write locks or reviewer paths even under an unsafe cast",async()=>withMcpDatabase(async db=>{
    const {actor,customerId}=await mcpFixture(db);
    await expect(db.query("INSERT INTO mcp_connection_customers(connection_id,workspace_id,customer_id) VALUES($1,$2,$3)",[actor.connectionId,actor.workspaceId,customerId])).rejects.toMatchObject({code:'23514'});
    await expect(withTransaction(client=>lockWorkspaceActor(client,actor))).rejects.toMatchObject({status:403});
    await expect(withTransaction(client=>requireSteward(client,actor as unknown as CurrentSession,customerId))).rejects.toMatchObject({status:403});
    for(const capability of ['create','revise','review'] as const)expect(()=>requirePlanCapability(actor,null,capability)).toThrow('Action not allowed');
    for(const capability of ['prepare','publish','send','brand','addresses'] as const)expect(()=>requireReportCapability(actor,capability,'delivery',true)).toThrow('Action not allowed');
  }));
  it("intersects partner grants and denies immediately with maintenance stopped",async()=>withMcpDatabase(async db=>{
    const {actor,customerId}=await mcpFixture(db,'partner');
    await withTransaction(client=>lockProfileActor(client,actor,customerId,undefined,true));
    await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE customer_id=$1 AND membership_id=$2",[customerId,actor.membershipId]);
    await expect(withTransaction(client=>lockProfileActor(client,actor,customerId,undefined,true))).rejects.toMatchObject({status:404});
  }));
  it("denies a revoked connection and immutable scope edits",async()=>withMcpDatabase(async db=>{
    const {actor,customerId}=await mcpFixture(db);
    await expect(db.query("UPDATE mcp_connections SET categories=ARRAY['knowledge'] WHERE id=$1",[actor.connectionId])).rejects.toMatchObject({code:'23514'});
    await db.query("UPDATE mcp_connections SET revoked_at=now(),revoker_membership_id=membership_id WHERE id=$1",[actor.connectionId]);
    await expect(withTransaction(client=>lockProfileActor(client,actor,customerId,undefined,true))).rejects.toMatchObject({status:401});
    await expect(db.query("UPDATE mcp_connections SET revoked_at=NULL,revoker_membership_id=NULL WHERE id=$1",[actor.connectionId])).rejects.toMatchObject({code:'23514'});
  }));
});
