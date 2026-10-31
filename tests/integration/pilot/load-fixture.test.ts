import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotLoadEvidenceFixture} from '../../fixtures/pilot/load';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {openOwnedPilotLoadSuite} from '../../fixtures/pilot/environment';
let owned:Awaited<ReturnType<typeof openOwnedPilotLoadSuite>>;
beforeAll(async()=>{owned=await openOwnedPilotLoadSuite({});},120000);
afterAll(async()=>{await owned?.close();});
it('prepares exactly twenty-five issued sessions two hundred fifty synthetic customers and ten thousand distinct reviewed passages with separate audience projections',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect();
 try{
  const fixture=await pilotLoadEvidenceFixture(db,AbortSignal.timeout(600000));expect(fixture.population).toEqual({sessions:25,internalSessions:15,assignedPartnerSessions:10,customers:250,eligiblePassages:10000,physicalPassages:20000,internalVisiblePassages:20000,deliveryVisiblePassages:10000});expect(fixture).toMatchObject({acceptedReadClassesPrepared:false,providerCalls:0,quotaResets:0});
  expect(Number((await db.query("SELECT count(*) FROM customer_grants WHERE workspace_id=$1 AND state='active'",[fixture.workspaceId])).rows[0].count)).toBe(2500);
  expect(Number((await db.query("SELECT count(*) FROM login_sessions WHERE workspace_id=$1 AND membership_id IS NOT NULL AND revoked_at IS NULL",[fixture.workspaceId])).rows[0].count)).toBe(25);
  expect(Number((await db.query("SELECT count(*) FROM profile_records WHERE workspace_id=$1 AND current_accepted_revision_id IS NOT NULL",[fixture.workspaceId])).rows[0].count)).toBe(2510);
  expect(Number((await db.query("SELECT count(*) FROM profile_command_receipts WHERE workspace_id=$1 AND action='accept_revision'",[fixture.workspaceId])).rows[0].count)).toBe(2510);
  expect((await db.query("SELECT classification,pilot_environment_id,pilot_provisioning_id FROM workspaces WHERE id=$1",[fixture.workspaceId])).rows[0]).toEqual({classification:'primary',pilot_environment_id:null,pilot_provisioning_id:null});
  expect(Number((await db.query('SELECT count(*) FROM retrieval_embedding_operations')).rows[0].count)).toBe(0);
 }finally{db.release();await pool.end();await closeRuntimePool();}
},660000);
