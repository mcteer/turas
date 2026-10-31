import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {issueSession,getCurrentSession,sessionCookieName,type CurrentSession} from '../../../lib/server/auth/sessions';
import {submitProfileCommand} from '../../../lib/server/profiles/service';
import {setPartnerGrant} from '../../../lib/server/access/service';
import {currentFactEligible} from '../../../lib/server/retrieval/context';
import {readRetrievalQuality} from '../../../lib/server/retrieval/quality-read';

/** Disposable owner scaffolding only. Dated observations use proposal/review commands, grants
 * use the ordinary administrator operation, and every actor uses the session issuer.
 * This prepares the fixed evidence population, not accepted plans/reports/training
 * or a completed workload. It must never be used against a hosted database. */
export async function pilotLoadEvidenceFixture(db:PoolClient,signal:AbortSignal){
 requireOwnedPilotDatabase(process.env,true);signal.throwIfAborted();
 const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 if(marker.length!==1||marker[0].environment_id!==process.env.TURAS_ENVIRONMENT_ID||Number(marker[0].schema_version)!==CURRENT_SCHEMA_VERSION)throw Error('Exact owned load schema required');
 const workspaceId=randomUUID(),organizationId=randomUUID();
 await db.query("INSERT INTO workspaces(id,name,classification) VALUES($1,'Synthetic fixed production load','primary')",[workspaceId]);
 await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic load organization')",[organizationId,workspaceId]);
 const actors:CurrentSession[]=[];
 for(let index=0;index<25;index++){
  signal.throwIfAborted();const principalId=index===0?DEMO_IDS.mcteer:randomUUID(),membershipId=randomUUID(),kind=index<15?'internal' as const:'partner' as const,role=index===0?'admin' as const:'member' as const,loginName=index===0?'mcteer':'synthetic-load-'+principalId;
  if(index!==0)await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic load participant')",[principalId,loginName]);
  await db.query('INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,$4,$5,$6)',[membershipId,principalId,workspaceId,kind,role,kind==='partner'?organizationId:null]);
  const session=await issueSession({principalId,membershipId,workspaceId,loginName,displayName:'Synthetic load participant',kind,role});
  const actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${sessionCookieName()}=${session.token}`}}));if(!actor||actor.membershipId!==membershipId||actor.workspaceId!==workspaceId||actor.kind!==kind)throw Error('Actual bound load session unavailable');actors.push(actor);
 }
 const customers:{id:string;recordIds:string[];revisionIds:string[];passageIds:string[]}[]=[];
 // Keep the report sample compact, with a heterogeneous corpus: 60/30/30
 // passages in its first three customers and 40 in each remaining customer.
 // All 10,000 passages still come from currently eligible reviewed observations.
 for(let index=0;index<250;index++){
  signal.throwIfAborted();const customerId=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,true)",[customerId,workspaceId,`Synthetic load customer ${index+1}`]);
  await db.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[customerId,workspaceId]);
  const revisionIds:string[]=[],recordIds:string[]=[];
  for(let claim=0;claim<(index===0?20:10);claim++){
   signal.throwIfAborted();const text=Array.from({length:4},(_,part)=>{const prefix=`Synthetic fixture customer ${index} claim ${claim} passage ${part}. Controlled test content. `;return prefix+('Synthetic engineering build stage timing observation process. '.repeat(40)).slice(0,1997-prefix.length);}).join('');
   const payload={kind:'product_use' as const,productKey:`synthetic-load-practice-${index}-${claim}`,displayName:'Synthetic Load Practice',state:'actual' as const,usageDescription:index<3?`Controlled synthetic engineering build stage timing observation for customer ${index}, practice ${claim}.`:text.slice(0,3997),observedAt:new Date(Date.now()-1000).toISOString()};
   await db.query('BEGIN');try{
    const proposal=await submitProfileCommand(actors[1+index%14],customerId,{action:'propose_record',requestKey:randomUUID(),workloadId:null,requestedAudience:'delivery',dataCategory:'delivery_context',payload,qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Controlled synthetic test input',directnessRationale:'Exact synthetic input',corroborationRationale:'Controlled fixture, not actual customer evidence',informationType:'adoption_process',dateBasis:'observation'}},db) as {recordId:string;revisionId:string};
    const row=(await db.query('SELECT v.content_digest,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1',[proposal.revisionId])).rows[0];
    await submitProfileCommand(actors[0],customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposal.revisionId,digest:row.content_digest,expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:row.current_accepted_revision_id,rationale:'Reviewed synthetic load input only; no actual customer outcome'},db);
    if(!currentFactEligible(await readRetrievalQuality(db,{source_kind:'accepted_profile',source_revision_id:proposal.revisionId},new Date())))throw Error('Load evidence is accepted but not currently fact eligible');
    const projection=(await db.query("SELECT id FROM retrieval_sources WHERE source_kind='accepted_profile' AND source_revision_id=$1 AND audience='delivery' AND lifecycle_state='current'",[proposal.revisionId])).rows;if(projection.length!==1)throw Error('Accepted eligible load projection unavailable');revisionIds.push(proposal.revisionId);recordIds.push(proposal.recordId);await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
  }
  for(const partner of actors.slice(15))await setPartnerGrant({actorPrincipalId:actors[0].principalId,actorSessionId:actors[0].sessionId,membershipId:partner.membershipId,customerId,expectedRevision:0,state:'active',requestKey:randomUUID()});
  const passageIds=(await db.query("SELECT p.id FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.workspace_id=$1 AND s.customer_id=$2 AND s.lifecycle_state='current' AND s.audience='delivery' ORDER BY s.source_revision_id,p.ordinal",[workspaceId,customerId])).rows.map(row=>String(row.id));if(passageIds.length!==(index===0?60:index<3?30:40))throw Error('Load customer passage population differs');customers.push({id:customerId,recordIds,revisionIds,passageIds});
 }
 // Normal review prepares separate internal/delivery copies of the fixed
 // 10,000 distinct passages. Internal retrieval may consider both copies;
 // retain and report this larger physical corpus rather than dropping one.
 const populations=(await db.query("SELECT s.audience,count(*)::int AS count FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.workspace_id=$1 AND s.lifecycle_state='current' GROUP BY s.audience ORDER BY s.audience",[workspaceId])).rows;
 if(JSON.stringify(populations)!==JSON.stringify([{audience:'delivery',count:10000},{audience:'internal',count:10000}])||actors.length!==25||customers.length!==250)throw Error('Fixed load population differs');
 const count=Number((await db.query("SELECT count(DISTINCT (s.source_revision_id,p.ordinal,p.passage_digest,p.locators::text))::int AS count FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.workspace_id=$1 AND s.lifecycle_state='current'",[workspaceId])).rows[0].count);
 if(count!==10000)throw Error('Fixed distinct load population differs');
 return {workspaceId,actors,customers,population:{sessions:25,internalSessions:15,assignedPartnerSessions:10,customers:250,eligiblePassages:count,physicalPassages:20000,internalVisiblePassages:20000,deliveryVisiblePassages:10000},acceptedReadClassesPrepared:false,providerCalls:0,quotaResets:0};
}
