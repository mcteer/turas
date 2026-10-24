import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {openOwnedPilotSuite,requireOwnedPilotDatabase} from '../../fixtures/pilot/environment';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {issueSession,getCurrentSession,sessionCookieName,type CurrentSession} from '../../../lib/server/auth/sessions';
import {submitProfileCommand} from '../../../lib/server/profiles/service';
import {materializeCurrentProjection} from '../../../lib/server/retrieval/projections';
import {reportSourceEligibility,type ReportSource,type ReportSourceScope} from '../../../lib/server/reports/sources';
import {nativeSourceKey} from '../../../lib/server/reports/native-sources';
import {closeRuntimePool} from '../../../lib/server/db/client';
let owned:Awaited<ReturnType<typeof openOwnedPilotSuite>>,db:Client,actor:CurrentSession,scope:ReportSourceScope;
type Source={ref:ReportSource;originalDigest:string;recordId:string};
let delivery:Source,commercial:Source,internal:Source;
async function create(dataCategory:'delivery_context'|'commercial',audience:'delivery'|'internal'):Promise<Source>{
 await db.query('BEGIN');try{
  const proposed=await submitProfileCommand(actor,scope.customerId,{action:'propose_record',requestKey:randomUUID(),workloadId:null,requestedAudience:audience,dataCategory,payload:{kind:'product_use',productKey:'synthetic-report-digest-'+randomUUID(),displayName:'Synthetic report digest source',state:'actual',usageDescription:'Controlled synthetic citation digest demonstration.',observedAt:new Date(Date.now()-1000).toISOString()},qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Controlled synthetic observation',directnessRationale:'Controlled synthetic demonstration',corroborationRationale:'Synthetic only',informationType:'adoption_process',dateBasis:'observation'}},db as unknown as PoolClient) as {revisionId:string;recordId:string};
  const head=(await db.query('SELECT v.content_digest,r.version FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposed.revisionId])).rows[0];
  await submitProfileCommand(actor,scope.customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:head.content_digest,expectedRecordVersion:Number(head.version),expectedAcceptedRevisionId:null,rationale:'Review controlled synthetic report source',partnerSafeReason:'Synthetic delivery source only',partnerSafeAttestation:'No actual customer fact'},db as unknown as PoolClient);
  const projection=await materializeCurrentProjection(db as unknown as PoolClient,'accepted_profile',proposed.revisionId,audience);if(!projection)throw Error('Current projection required');
  const source=(await db.query('SELECT source_generation,content_digest FROM retrieval_sources WHERE id=$1',[projection])).rows[0];await db.query('COMMIT');
  return {recordId:proposed.recordId,originalDigest:head.content_digest,ref:{kind:'accepted_profile',id:proposed.revisionId,revisionId:proposed.revisionId,generation:Number(source.source_generation),contentDigest:source.content_digest,engagementId:null,decisionId:null}};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
beforeAll(async()=>{
 owned=await openOwnedPilotSuite({postgresMajor:18,deadlineMs:180000});db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
 const issued=await issueSession({principalId:DEMO_IDS.mcteer,loginName:'mcteer',displayName:'mcteer',membershipId:DEMO_IDS.mcteerMembership,workspaceId:DEMO_IDS.workspace,kind:'internal',role:'admin'});
 const current=await getCurrentSession(new Request(owned.environment.origin,{headers:{cookie:sessionCookieName()+'='+issued.token}}));if(!current)throw Error('Actual synthetic session required');actor=current;
 scope={environmentId:owned.environment.environmentId,workspaceId:DEMO_IDS.workspace,customerId:DEMO_IDS.sharedCustomer,audience:'delivery'};
 delivery=await create('delivery_context','delivery');commercial=await create('commercial','internal');internal=await create('delivery_context','internal');
},60000);
afterAll(async()=>{await db?.end();await closeRuntimePool();await owned?.close();});
async function eligible(ref:ReportSource,override:Partial<ReportSourceScope>={}){return (await reportSourceEligibility(db as unknown as PoolClient,{...scope,...override},[ref])).get(nativeSourceKey(ref));}
it('accepts the exact current projection digest carried by a cited plan',async()=>{expect(delivery.ref.contentDigest).not.toBe(delivery.originalDigest);expect(await eligible(delivery.ref)).toBe(true);});
it('continues accepting the exact original profile digest for direct report inputs',async()=>{expect(await eligible({...delivery.ref,contentDigest:delivery.originalDigest})).toBe(true);});
it('rejects an invented digest despite a current accepted revision',async()=>{expect(await eligible({...delivery.ref,contentDigest:'f'.repeat(64)})).toBe(false);});
it('rejects a different source generation',async()=>{expect(await eligible({...delivery.ref,generation:delivery.ref.generation+1})).toBe(false);});
it('rejects the current citation under a different customer scope',async()=>{expect(await eligible(delivery.ref,{customerId:DEMO_IDS.deniedCustomer})).toBe(false);});
it('does not admit commercial profile context through a retrieval projection',async()=>{expect(await eligible(commercial.ref,{audience:'leadership'})).toBe(false);});
it('preserves delivery audience fences for internal profile projections',async()=>{expect(await eligible(internal.ref)).toBe(false);expect(await eligible(internal.ref,{audience:'leadership'})).toBe(true);});
it('withholds both digest representations immediately after withdrawal before passage cleanup',async()=>{
 const version=Number((await db.query('SELECT version FROM profile_records WHERE id=$1',[delivery.recordId])).rows[0].version);
 await db.query('BEGIN');try{await submitProfileCommand(actor,scope.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:delivery.ref.revisionId,expectedRecordVersion:version,rationale:'Withdraw the controlled synthetic report source'},db as unknown as PoolClient);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
 expect(Number((await db.query('SELECT count(*) FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.source_revision_id=$1',[delivery.ref.revisionId])).rows[0].count)).toBeGreaterThan(0);
 expect(await eligible(delivery.ref)).toBe(false);expect(await eligible({...delivery.ref,contentDigest:delivery.originalDigest})).toBe(false);
});
