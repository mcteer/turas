import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotLoadEvidenceFixture} from '../../fixtures/pilot/load';
import {pilotLoadDeliveryFixture} from '../../fixtures/pilot/load-delivery';
import {pilotLoadTrainingFixture} from '../../fixtures/pilot/load-training';
import {readPartnerAssignment} from '../../../lib/server/partners/assignments';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {openOwnedPilotLoadSuite} from '../../fixtures/pilot/environment';
let owned:Awaited<ReturnType<typeof openOwnedPilotLoadSuite>>;
beforeAll(async()=>{owned=await openOwnedPilotLoadSuite({renderer:true});},120000);
afterAll(async()=>{await owned?.close();});
it('publishes a normally reviewed guide and verifies every assigned partner demonstration through mcteer',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect(),signal=AbortSignal.timeout(600000);
 try{const evidence=await pilotLoadEvidenceFixture(db,signal),delivery=await pilotLoadDeliveryFixture(db,evidence,signal),training=await pilotLoadTrainingFixture(db,evidence,delivery,signal);
  expect(training.assignments).toHaveLength(10);expect(training.quotaResets).toBe(0);
  for(const assignment of training.assignments){const view=await readPartnerAssignment(evidence.actors[assignment.actorIndex],assignment.assignmentId);expect(view.checkpoints[0].attempts[0].state).toBe('verified');}
  expect(Number((await db.query("SELECT count(*) FROM partner_review_decisions WHERE workspace_id=$1 AND action='verify' AND reviewer_membership_id=$2",[evidence.workspaceId,evidence.actors[0].membershipId])).rows[0].count)).toBe(10);
 }finally{db.release();await pool.end();await closeRuntimePool();}
},660000);
