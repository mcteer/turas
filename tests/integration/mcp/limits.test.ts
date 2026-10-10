import {createMcpConnection} from '../../../lib/server/mcp/management';
import {authenticateMcpBearer} from '../../../lib/server/mcp/credentials';
import { describe,expect,it } from "vitest";
import { mcpFixture,mcpInternalPeer,withMcpDatabase } from "../../fixtures/mcp/setup";
import { admitMcpRequest,releaseMcpLease } from "../../../lib/server/mcp/limits";
import { withTransaction } from "../../../lib/server/db/client";
import { randomUUID } from 'node:crypto';
describe("MCP independently committed limits",()=>{
  it('enforces four reads per member and sixteen per workspace across distinct credentials',async()=>withMcpDatabase(async db=>{
    const {actor,browser}=await mcpFixture(db),leases:Awaited<ReturnType<typeof admitMcpRequest>>[]=[];
    async function credential(owner:typeof browser){const created=await createMcpConnection(owner,{requestKey:randomUUID(),name:'Synthetic concurrency',categories:['knowledge'],customerIds:[],lifetimeDays:7});if(!created.secretAvailable)throw Error('Missing synthetic credential');return authenticateMcpBearer('Bearer '+created.credential);}
    try{
      const second=await credential(browser),third=await credential(browser);
      for(const current of [actor,actor,second,second])leases.push(await admitMcpRequest(current));
      await expect(admitMcpRequest(third)).rejects.toMatchObject({status:429});
      for(let i=0;i<6;i++){const peer=await mcpInternalPeer(db,browser.workspaceId),current=await credential(peer);leases.push(await admitMcpRequest(current),await admitMcpRequest(current));}
      const extra=await credential(await mcpInternalPeer(db,browser.workspaceId));
      await expect(admitMcpRequest(extra)).rejects.toMatchObject({status:429});
      expect((await db.query('SELECT count(*)::integer AS n FROM mcp_read_leases WHERE workspace_id=$1 AND expires_at>clock_timestamp()',[actor.workspaceId])).rows[0].n).toBe(16);
    }finally{for(const lease of leases)await releaseMcpLease(lease);}
  }));
  it('enforces current membership and workspace buckets across connection boundaries',async()=>withMcpDatabase(async db=>{
    for(const [bucket,maximum] of [['member',60],['workspace',240]] as const){
      const {actor}=await mcpFixture(db),subject=bucket==='member'?actor.membershipId:actor.workspaceId;
      await db.query(`INSERT INTO mcp_rate_windows(environment_id,workspace_id,bucket,subject_id,window_start,count)
        VALUES($1,$2,$3,$4,date_trunc('minute',clock_timestamp()),$5) ON CONFLICT DO NOTHING`,[actor.environmentId,actor.workspaceId,bucket,subject,maximum]);
      await expect(admitMcpRequest(actor)).rejects.toMatchObject({status:429});
      expect((await db.query('SELECT count FROM mcp_rate_windows WHERE environment_id=$1 AND workspace_id=$2 AND bucket=$3 AND subject_id=$4 ORDER BY window_start DESC LIMIT 1',
        [actor.environmentId,actor.workspaceId,bucket,subject])).rows[0].count).toBe(maximum+1);
    }
  }));
  it('ignores expired leases and preserves the independent charge for an aborted read',async()=>withMcpDatabase(async db=>{
    const {actor}=await mcpFixture(db);
    await db.query(`WITH timing AS MATERIALIZED(SELECT clock_timestamp() AS at) INSERT INTO mcp_read_leases(id,environment_id,workspace_id,principal_id,membership_id,connection_id,created_at,expires_at)
      SELECT $1,$2,$3,$4,$5,$6,at-interval '11 seconds',at-interval '1 second' FROM timing`,
      [randomUUID(),actor.environmentId,actor.workspaceId,actor.principalId,actor.membershipId,actor.connectionId]);
    const lease=await admitMcpRequest(actor);await releaseMcpLease(lease);await releaseMcpLease(lease);
    expect((await db.query("SELECT sum(count)::integer AS n FROM mcp_rate_windows WHERE bucket='connection' AND subject_id=$1",[actor.connectionId])).rows[0].n).toBe(1);
  }));
  it("limits simultaneous reads and releases idempotently",async()=>withMcpDatabase(async db=>{
    const {actor}=await mcpFixture(db);
    const a=await admitMcpRequest(actor),b=await admitMcpRequest(actor);
    await expect(admitMcpRequest(actor)).rejects.toMatchObject({status:429});
    await releaseMcpLease(a);await releaseMcpLease(a);
    const c=await admitMcpRequest(actor);await releaseMcpLease(b);await releaseMcpLease(c);
    expect((await db.query("SELECT count(*)::integer AS n FROM mcp_read_leases WHERE connection_id=$1",[actor.connectionId])).rows[0].n).toBe(0);
  }));
  it("cannot erase rate charges by rolling back the read",async()=>withMcpDatabase(async db=>{
    const {actor}=await mcpFixture(db);
    for(let i=0;i<30;i++){
      const lease=await admitMcpRequest(actor);
      await expect(withTransaction(async()=>{throw Error('Synthetic read failure');})).rejects.toThrow('Synthetic read failure');
      await releaseMcpLease(lease);
    }
    await expect(admitMcpRequest(actor)).rejects.toMatchObject({status:429});
    expect((await db.query("SELECT max(count) AS n FROM mcp_rate_windows WHERE subject_id=$1",[actor.connectionId])).rows[0].n).toBe(31);
  }));
});
