import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotLoadEvidenceFixture} from '../../fixtures/pilot/load';
import {pilotLoadDeliveryFixture} from '../../fixtures/pilot/load-delivery';
import {pilotLoadInternalFixture} from '../../fixtures/pilot/load-internal';
import {pilotLoadLearningFixture} from '../../fixtures/pilot/load-learning';
import {readLearningMeasurement} from '../../../lib/server/learning/measurements';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {openOwnedPilotLoadSuite} from '../../fixtures/pilot/environment';
let owned:Awaited<ReturnType<typeof openOwnedPilotLoadSuite>>;
beforeAll(async()=>{owned=await openOwnedPilotLoadSuite({renderer:true});},120000);
afterAll(async()=>{await owned?.close();});
it('approves an exact synthetic quarter measurement using normally accepted execution and explicit mcteer review',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect(),signal=AbortSignal.timeout(600000);
 try{const evidence=await pilotLoadEvidenceFixture(db,signal),delivery=await pilotLoadDeliveryFixture(db,evidence,signal);await pilotLoadInternalFixture(db,evidence);const learning=await pilotLoadLearningFixture(db,evidence,delivery),view=await readLearningMeasurement(evidence.actors[0],learning.measurementId);expect(view.state).toBe('approved');expect(view.content).not.toBeNull();expect(view.approval).toMatchObject({decision:'approve',reuseApproved:true});expect(Number((await db.query('SELECT count(*) FROM customer_references WHERE workspace_id=$1',[evidence.workspaceId])).rows[0].count)).toBe(250);
 }finally{db.release();await pool.end();await closeRuntimePool();}
},660000);
