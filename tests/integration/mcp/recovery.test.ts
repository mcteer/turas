import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withTransaction } from '../../../lib/server/db/client';
import { createMcpConnection,revokeMcpConnection,reconcileMcpRequest } from '../../../lib/server/mcp/management';
import { cleanupMcpMetadata } from '../../../lib/server/mcp/retention';
import { assertMcpReady } from '../../../lib/server/mcp/schema';
import { mcpInternalPeer,mcpAcceptedFact } from '../../fixtures/mcp/setup';
import { readMcpProfile } from '../../../lib/server/mcp/profiles';
import { projectMcpTool } from '../../../lib/server/mcp/projections';
describe('MCP disablement and idempotent recovery',()=>{
 it('denies incomplete runtime grants without request-time repair',async()=>withMcpDatabase(async db=>{
  await db.query('REVOKE DELETE ON mcp_management_cursors FROM turas_runtime');
  try{await expect(withTransaction(client=>assertMcpReady(client))).rejects.toMatchObject({status:503});}
  finally{await db.query('GRANT DELETE ON mcp_management_cursors TO turas_runtime');}
  await withTransaction(client=>assertMcpReady(client));
 }));
 it('holds the original head lock through final serialization before allowing withdrawal',async()=>withMcpDatabase(async db=>{
  const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
  const fact=await mcpAcceptedFact(db,browser,reviewer,customerId);
  let withdrawn=false;
  await withTransaction(async client=>{
   const result=await projectMcpTool(client,actor,'turas_profile_read_v1','profiles',customerId,()=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20}));
   const withdrawal=db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1',[fact.recordId]).then(()=>{withdrawn=true;});
   void withdrawal;
   await new Promise(resolve=>setTimeout(resolve,30));expect(withdrawn).toBe(false);
   expect(JSON.parse(JSON.stringify(result)).structuredContent.status).toBe('available');
  });
  await db.query('SELECT 1');expect(withdrawn).toBe(true);
  const next=await withTransaction(client=>readMcpProfile(client,actor,{customerId,section:'facts',limit:20}));expect(next.status).toBe('empty');
 }));
 it('cleans revoked secret hashes while retaining revocation and request receipts, even disabled',async()=>withMcpDatabase(async db=>{
  const {browser}=await mcpFixture(db),requestKey=randomUUID();
  const created=await createMcpConnection(browser,{requestKey,name:'Synthetic retention',categories:['knowledge'],customerIds:[],lifetimeDays:7});
  await revokeMcpConnection(browser,created.connection.id,{requestKey:randomUUID(),expectedConnectionId:created.connection.id});
  const prior=process.env.TURAS_015_DISABLED;process.env.TURAS_015_DISABLED='1';
  try{
   await expect(withTransaction(client=>assertMcpReady(client,true))).rejects.toMatchObject({status:503});
   await withTransaction(cleanupMcpMetadata);await withTransaction(cleanupMcpMetadata);
   const row=(await db.query('SELECT revoked_at,credential_hash FROM mcp_connections WHERE id=$1',[created.connection.id])).rows[0];
   expect(row.revoked_at).not.toBeNull();expect(row.credential_hash).toBeNull();
   expect((await reconcileMcpRequest(browser,requestKey)).confirmed).toBe(true);
   expect((await db.query('SELECT count(*)::integer AS n FROM mcp_management_receipts WHERE connection_id=$1',[created.connection.id])).rows[0].n).toBe(2);
  }finally{process.env.TURAS_015_DISABLED=prior;}
 }));
 it('denies an environment mismatch and never attempts schema initialization',async()=>withMcpDatabase(async db=>{
  const before=(await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version;
  const prior=process.env.TURAS_ENVIRONMENT_ID;process.env.TURAS_ENVIRONMENT_ID='test-mcp-wrong-environment';
  try{await expect(withTransaction(client=>assertMcpReady(client))).rejects.toMatchObject({status:503});}
  finally{process.env.TURAS_ENVIRONMENT_ID=prior;}
  expect((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(before);
 }));
});
