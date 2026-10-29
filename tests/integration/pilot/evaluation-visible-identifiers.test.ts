import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {getServerConfig} from '../../../lib/server/config';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {createProfileTestSession} from '../../fixtures/profiles';
import {submitProfileCommand} from '../../../lib/server/profiles/service';
import {profileEvaluationState} from '../../../evals/driver';
it('recognizes accepted audience-visible workload references while denying foreign pending and withheld identifiers',async()=>withPilotEnvironment(async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true),max:1}),db=await pool.connect();
 try{
  const actor=await createProfileTestSession(db,'mcteer'),delivery=randomUUID(),internal=randomUUID(),pending=randomUUID(),foreign=randomUUID();
  for(const id of [delivery,internal,pending,foreign])await db.query("INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name) VALUES($1,$2,$3,'Synthetic evaluation reference')",[id,DEMO_IDS.workspace,id===foreign?DEMO_IDS.deniedCustomer:DEMO_IDS.sharedCustomer]);
  const add=async(workloadId:string,audience:'delivery'|'internal',accept:boolean)=>{
   const proposal=await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'propose_record',requestKey:randomUUID(),workloadId,requestedAudience:audience,dataCategory:audience==='delivery'?'delivery_context':'internal_operations',payload:{kind:'product_use',productKey:'evaluation-'+randomUUID(),displayName:'Synthetic evaluation product',state:'actual',usageDescription:'Synthetic reference visibility check',observedAt:new Date(Date.now()-1000).toISOString()}},db) as {revisionId:string;recordId:string};
   if(accept){const revision=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposal.revisionId])).rows[0];await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposal.revisionId,digest:revision.content_digest,expectedRecordVersion:Number(revision.version),expectedAcceptedRevisionId:revision.current_accepted_revision_id,rationale:'Reviewed synthetic visible reference'},db);}return proposal;
  };
  const accepted=await add(delivery,'delivery',true);await add(internal,'internal',true);await add(pending,'delivery',false);
  const config=getServerConfig(),member=await profileEvaluationState(config,DEMO_IDS.sharedCustomer,'mcteer'),partner=await profileEvaluationState(config,DEMO_IDS.sharedCustomer,'partner');
  expect(member.knownIds.has(delivery)).toBe(true);expect(member.knownIds.has(internal)).toBe(true);expect(partner.knownIds.has(delivery)).toBe(true);expect(partner.knownIds.has(internal)).toBe(false);
  for(const state of [member,partner])for(const id of [pending,foreign,randomUUID()])expect(state.knownIds.has(id)).toBe(false);
  const current=(await db.query('SELECT version FROM profile_records WHERE id=$1',[accepted.recordId])).rows[0];
  await submitProfileCommand(actor,DEMO_IDS.sharedCustomer,{action:'retract_revision',requestKey:randomUUID(),revisionId:accepted.revisionId,expectedRecordVersion:Number(current.version),rationale:'Withdraw synthetic accepted reference'},db);
  expect((await profileEvaluationState(config,DEMO_IDS.sharedCustomer,'partner')).knownIds.has(delivery)).toBe(false);
 }finally{db.release();await pool.end();}
},{postgresMajor:18,deadlineMs:120000}),150000);
