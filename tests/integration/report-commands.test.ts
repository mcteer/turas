import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {withReportsDatabase} from '../fixtures/reports/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {executeReportCommand} from '../../lib/server/reports/commands';
import {reportCommandSchema} from '../../lib/server/reports/schema';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
describe('current authority exact command replay',()=>{
 it('recovers a lost acknowledgement without a second write or quota charge',async()=>{
  const actor=await withReportsDatabase(db=>createProfileTestSession(db,'mcteer'));
  const prior=process.env.TURAS_REPORTS_ENABLED;process.env.TURAS_REPORTS_ENABLED='true';
  try{
   let writes=0;const raw={action:'synthetic',requestKey:randomUUID(),expectedVersion:1,rationale:'Synthetic exact review'};
   const schema=reportCommandSchema.extend({action:z.literal('synthetic')});
   const handler=async()=>{writes++;return {reportId:randomUUID()};},project=async(_db:any,ids:any)=>ids;
   const first=await executeReportCommand(actor,DEMO_IDS.sharedCustomer,'delivery','publish',schema,raw,handler,project);
   expect(await executeReportCommand(actor,DEMO_IDS.sharedCustomer,'delivery','publish',schema,raw,handler,project)).toEqual(first);expect(writes).toBe(1);
   await expect(executeReportCommand(actor,DEMO_IDS.sharedCustomer,'delivery','publish',schema,{...raw,rationale:'Changed'},handler,project)).rejects.toMatchObject({code:'request_conflict'});
   await withReportsDatabase(db=>db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[actor.sessionId]));
   await expect(executeReportCommand(actor,DEMO_IDS.sharedCustomer,'delivery','publish',schema,raw,handler,project)).rejects.toMatchObject({status:401});
  }finally{if(prior===undefined)delete process.env.TURAS_REPORTS_ENABLED;else process.env.TURAS_REPORTS_ENABLED=prior;}
 });
});
