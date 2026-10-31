import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotLoadEvidenceFixture} from '../../fixtures/pilot/load';
import {pilotLoadInternalFixture} from '../../fixtures/pilot/load-internal';
import {readSupportWorkspace} from '../../../lib/server/support/projection';
import {readExpansionWorkspace} from '../../../lib/server/expansion/projection';
import {readGap} from '../../../lib/server/gaps/service';
import {readLearningDashboard} from '../../../lib/server/learning/dashboard';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {openOwnedPilotLoadSuite} from '../../fixtures/pilot/environment';
let owned:Awaited<ReturnType<typeof openOwnedPilotLoadSuite>>;
beforeAll(async()=>{owned=await openOwnedPilotLoadSuite({});},120000);
afterAll(async()=>{await owned?.close();});
it('reviews support unknowns defers an owner-controlled hypothesis and accepts a suspected gap through normal commands',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect();
 try{const evidence=await pilotLoadEvidenceFixture(db,AbortSignal.timeout(600000)),records=await pilotLoadInternalFixture(db,evidence),reviewer=evidence.actors[0],customerId=evidence.customers[0].id;
  const support=await readSupportWorkspace(reviewer,customerId,null,'delivery',{limit:20});expect(support.assessment?.accepted).toBeTruthy();
  const expansion=await readExpansionWorkspace(reviewer,customerId,{recordId:records.expansion.recordId});expect(expansion.records[0].disposition).toBe('deferred');
  expect((await readGap(reviewer,records.gapId)).impacts).toHaveLength(1);await readLearningDashboard(reviewer,{});
  expect(records).toMatchObject({learningOutcomePrepared:false,providerCalls:0});
 }finally{db.release();await pool.end();await closeRuntimePool();}
},660000);
