import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotLoadEvidenceFixture} from '../../fixtures/pilot/load';
import {pilotLoadDeliveryFixture} from '../../fixtures/pilot/load-delivery';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {openOwnedPilotLoadSuite} from '../../fixtures/pilot/environment';
let owned:Awaited<ReturnType<typeof openOwnedPilotLoadSuite>>;
beforeAll(async()=>{owned=await openOwnedPilotLoadSuite({renderer:true});},120000);
afterAll(async()=>{await owned?.close();});
it('prepares normally accepted plans reviewed execution and an actually rendered published report in the fixed load workspace',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect(),signal=AbortSignal.timeout(600000);
 try{const evidence=await pilotLoadEvidenceFixture(db,signal),delivery=await pilotLoadDeliveryFixture(db,evidence,signal);
  expect(delivery.engagementId).toBeTruthy();expect(delivery.reports).toHaveLength(3);
  const rows=(await db.query('SELECT s.state,r.workspace_id FROM report_revision_states s JOIN report_revisions r ON r.id=s.revision_id WHERE r.id=ANY($1::uuid[])',[delivery.reports.map(r=>r.revisionId)])).rows;
  expect(rows).toHaveLength(3);expect(rows.every(row=>row.workspace_id===evidence.workspaceId)).toBe(true);expect(rows.filter(row=>row.state==='published')).toHaveLength(1);
  expect((await db.query('SELECT state FROM report_brand_profiles WHERE id=$1',[delivery.brandId])).rows[0].state).toBe('approved');
  expect(Number((await db.query("SELECT count(*) FROM report_jobs WHERE environment_id=$1 AND kind='render' AND state='completed'",[process.env.TURAS_ENVIRONMENT_ID])).rows[0].count)).toBe(2);
  expect(Number((await db.query("SELECT count(*) FROM report_jobs WHERE environment_id=$1 AND kind='dispatch'",[process.env.TURAS_ENVIRONMENT_ID])).rows[0].count)).toBe(0);
 }finally{db.release();await pool.end();await closeRuntimePool();}
},660000);
