import {it,expect} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {createProfileTestSession} from '../../fixtures/profiles';
import {DEMO_IDS} from '../../fixtures/identities';
import {submitProfileCommand} from '../../../lib/server/profiles/service';
async function fixture(run:(db:PoolClient)=>Promise<void>){
 await withPilotEnvironment(async()=>{
  const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect();
  try{await db.query('BEGIN');await run(db);}finally{await db.query('ROLLBACK');db.release();await pool.end();}
 },{postgresMajor:18,deadlineMs:180000});
}
function payload(productKey:string){return {kind:'product_use',productKey,displayName:'Synthetic reviewed projection',state:'actual',usageDescription:'Controlled synthetic observed process',observedAt:new Date(Date.now()-1000).toISOString()};}
const qualityInput={rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Controlled synthetic observation',directnessRationale:'Direct synthetic observation',corroborationRationale:'Synthetic demonstration only',informationType:'adoption_process',dateBasis:'observation'};
async function accept(db:PoolClient,actor:Awaited<ReturnType<typeof createProfileTestSession>>,revisionId:string){
 const row=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[revisionId])).rows[0];
 return submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'accept_revision',requestKey:randomUUID(),revisionId,digest:row.content_digest,expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:row.current_accepted_revision_id,rationale:'Exact synthetic review'},db);
}
it('creates only exact accepted projections and retires corrections and retractions through normal commands',async()=>fixture(async db=>{
 const actor=await createProfileTestSession(db,'mcteer'),productKey='projection-'+randomUUID();
 const draft=await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'propose_record',requestKey:randomUUID(),payload:payload(productKey),requestedAudience:'delivery',dataCategory:'delivery_context',qualityInput},db) as {recordId:string;revisionId:string};
 const sources=async(id:string)=>(await db.query('SELECT audience,lifecycle_state FROM retrieval_sources WHERE source_kind=\'accepted_profile\' AND source_revision_id=$1 ORDER BY audience',[id])).rows;
 expect(await sources(draft.revisionId)).toEqual([]);
 await accept(db,actor,draft.revisionId);
 expect(await sources(draft.revisionId)).toEqual([{audience:'delivery',lifecycle_state:'current'},{audience:'internal',lifecycle_state:'current'}]);
 expect((await db.query('SELECT embedding FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.source_revision_id=$1',[draft.revisionId])).rows.every(row=>row.embedding===null)).toBe(true);
 const next=await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'propose_revision',requestKey:randomUUID(),recordId:draft.recordId,expectedRecordVersion:1,expectedAcceptedRevisionId:draft.revisionId,payload:{...payload(productKey),usageDescription:'Corrected controlled synthetic observation'},requestedAudience:'delivery',dataCategory:'delivery_context',qualityInput},db) as {revisionId:string};
 expect(await sources(next.revisionId)).toEqual([]);
 await accept(db,actor,next.revisionId);
 expect((await sources(draft.revisionId)).every(row=>row.lifecycle_state==='retired')).toBe(true);
 expect((await sources(next.revisionId)).map(row=>row.lifecycle_state)).toEqual(['current','current']);
 await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'retract_revision',requestKey:randomUUID(),revisionId:next.revisionId,expectedRecordVersion:2,rationale:'Controlled synthetic withdrawal'},db);
 expect((await sources(next.revisionId)).every(row=>row.lifecycle_state==='retired')).toBe(true);
}),210000);
it('keeps internal acceptance private and honors the retrieval authoring rollback switch',async()=>fixture(async db=>{
 const actor=await createProfileTestSession(db,'mcteer');
 async function propose(){return await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'propose_record',requestKey:randomUUID(),payload:payload('private-'+randomUUID()),requestedAudience:'internal',dataCategory:'internal_operations',qualityInput},db) as {revisionId:string};}
 const internal=await propose();await accept(db,actor,internal.revisionId);
 expect((await db.query('SELECT audience FROM retrieval_sources WHERE source_revision_id=$1',[internal.revisionId])).rows).toEqual([{audience:'internal'}]);
 const disabled=await propose(),prior=process.env.TURAS_005_DISABLED;
 try{process.env.TURAS_005_DISABLED='1';await accept(db,actor,disabled.revisionId);}finally{if(prior===undefined)delete process.env.TURAS_005_DISABLED;else process.env.TURAS_005_DISABLED=prior;}
 expect((await db.query('SELECT id FROM retrieval_sources WHERE source_revision_id=$1',[disabled.revisionId])).rows).toEqual([]);
 expect((await db.query('SELECT current_accepted_revision_id FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1',[disabled.revisionId])).rows[0].current_accepted_revision_id).toBe(disabled.revisionId);
}),210000);
