import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createProfileTestSession } from '../profiles';
import { hashSessionToken, type CurrentSession } from '../../../lib/server/auth/sessions';
import { requireOwnedLearningDatabase } from '../../../scripts/learning-environment';
/** Synthetic sessions are created only inside the runner's disposable database. */
export async function learningTestActors(db:PoolClient):Promise<Record<'admin'|'member'|'partner',CurrentSession>>{
  requireOwnedLearningDatabase(process.env,true);
  const actors={} as Record<'admin'|'member'|'partner',CurrentSession>;
  for(const [role,login] of [['admin','mcteer'],['member','panel'],['partner','partner']] as const){
    const actor=await createProfileTestSession(db,login),token=randomBytes(32).toString('base64url');
    await db.query('UPDATE login_sessions SET token_hash=$1 WHERE id=$2',[hashSessionToken(token),actor.sessionId]);
    actors[role]={...actor,token};
  }
  return actors;
}

import { randomUUID } from 'node:crypto';
import { submitProfileCommand } from '../../../lib/server/profiles/service';
export async function learningAcceptedOriginal(db:PoolClient,author:CurrentSession,admin:CurrentSession,customerId:string){
 requireOwnedLearningDatabase(process.env,true);
 const observedAt=new Date(Date.now()-1000).toISOString();
 const proposed=await submitProfileCommand(author,customerId,{action:'propose_record',requestKey:randomUUID(),workloadId:null,
 requestedAudience:'delivery',dataCategory:'delivery_context',payload:{kind:'product_use',productKey:`synthetic-learning-${randomUUID()}`,displayName:'Synthetic learning product',state:'actual',usageDescription:'Observed synthetic delivery evidence',observedAt},evidenceRevisionIds:[],
 qualityInput:{rubricVersion:'evidence-quality-v1',R:4,D:4,C:2,reliabilityRationale:'Synthetic accountable primary observation',directnessRationale:'Retained synthetic demonstration',corroborationRationale:'One authoritative observation',informationType:'adoption_process',dateBasis:'observation'}},db) as {recordId:string;revisionId:string};
 const row=(await db.query(`SELECT v.content_digest,v.revision_number,r.version,r.current_accepted_revision_id FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1`,[proposed.revisionId])).rows[0];
 await submitProfileCommand(admin,customerId,{action:'accept_revision',requestKey:randomUUID(),revisionId:proposed.revisionId,digest:row.content_digest,expectedRecordVersion:Number(row.version),expectedAcceptedRevisionId:row.current_accepted_revision_id,rationale:'Separately reviewed synthetic original'},db);
 return {sourceKind:'accepted_profile' as const,sourceRevisionId:proposed.revisionId,sourceGeneration:Number(row.revision_number),sourceDigest:row.content_digest,rightsBasis:'Explicit synthetic permission for reviewed reusable practice'};
}

import { DEMO_IDS } from '../../../lib/server/bootstrap-ids';
export async function learningPartnerPeer(db:PoolClient,customerId:string|null=DEMO_IDS.sharedCustomer):Promise<CurrentSession>{
 requireOwnedLearningDatabase(process.env,true);
 const principalId=randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString('base64url'),loginName=`synthetic-learning-partner-${principalId}`;
 await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic learning peer')",[principalId,loginName]);
 await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,partner_org_id,role) VALUES($1,$2,$3,'partner',$4,'member')",[membershipId,principalId,DEMO_IDS.workspace,DEMO_IDS.partnerOrganization]);
 await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,principalId,hashSessionToken(token)]);
 if(customerId)await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),membershipId,DEMO_IDS.workspace,customerId,DEMO_IDS.mcteer]);
 return {sessionId,token,principalId,membershipId,workspaceId:DEMO_IDS.workspace,loginName,displayName:'Synthetic learning peer',kind:'partner',role:'member',expiresAt:new Date(Date.now()+3600000)};
}

import { createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate } from '../../../lib/server/knowledge/service';
export async function seedLearningPublicPractice(db:PoolClient){
 const actors=await learningTestActors(db),lineage=await learningAcceptedOriginal(db,actors.member,actors.admin,DEMO_IDS.sharedCustomer);
 const payload={title:'Canonical synthetic learning practice',productVersion:'Unknown',problem:'An observed reusable engineering concern',prerequisites:'Check current applicability',solution:'Measure independently accepted delivery evidence',reasoning:'Ground decisions in observed evidence',applicability:'Separately reviewed engineering contexts',limitations:'Does not establish account intent',validation:'Verify the current originals'};
 const draft=await createKnowledgeCandidate(db,actors.member,{idempotencyKey:randomUUID(),customerId:DEMO_IDS.sharedCustomer,payload,lineage:[lineage]});
 await submitKnowledgeCandidate(db,actors.member,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest});
 const published=await decideKnowledgeCandidate(db,actors.admin,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Separately reviewed canonical synthetic sanitization and rights',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
 return {actors,lineage,draft,published};
}

/** Independent workspace keeps irreversible activation and production quotas isolated between journeys. */
export async function learningScopedFixture(db:PoolClient){
 requireOwnedLearningDatabase(process.env,true);
 const workspaceId=randomUUID(),customerId=randomUUID(),organizationId=randomUUID();
 await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic isolated learning workspace')",[workspaceId]);
 await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic isolated customer',true)",[customerId,workspaceId]);
 await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic isolated partner')",[organizationId,workspaceId]);
 await db.query('INSERT INTO learning_workspace_state(environment_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[process.env.TURAS_ENVIRONMENT_ID,workspaceId]);
 const actors={} as Record<'admin'|'member'|'partner',CurrentSession>;
 for(const [name,kind,role] of [['admin','internal','admin'],['member','internal','member'],['partner','partner','member']] as const){
  const principalId=randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),token=randomBytes(32).toString('base64url'),loginName=`synthetic-learning-${name}-${principalId}`;
  await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic isolated learning actor')",[principalId,loginName]);
  await db.query('INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,$4,$5,$6)',[membershipId,principalId,workspaceId,kind,role,kind==='partner'?organizationId:null]);
  await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sessionId,principalId,hashSessionToken(token)]);
  actors[name]={principalId,membershipId,sessionId,token,workspaceId,kind,role,loginName,displayName:'Synthetic isolated learning actor',expiresAt:new Date(Date.now()+3600000)};
 }
 await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actors.partner.membershipId,workspaceId,customerId,actors.admin.principalId]);
 return {workspaceId,customerId,actors};
}
