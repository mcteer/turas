import {randomUUID,createHash} from 'node:crypto';
import type {Client} from 'pg';
import type {AppIdentity} from '../../lib/server/research/specialists/identity';
import {getServerConfig} from '../../lib/server/config';
import {isolatedChatActor} from './isolated-chat-actor';
export async function legacyResearchFixture(db:Client){
 const actor=await isolatedChatActor(db,'internal','member');
 const customerId=randomUUID();
 await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic parity account',false)",[customerId,actor.workspaceId]);
 const identity:AppIdentity={...actor,userId:actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID};
 return {actor,customerId,identity};
}
export async function legacyResearchSource(db:Client,identity:AppIdentity,customerId:string,input:{quote:string;passage?:string;title?:string;url?:string;age?:number;ledger?:boolean;owner?:string;workload?:string;fetchKey?:string;checkedAt?:string}){
 const revisionId=randomUUID(),sourceId=randomUUID(),url=input.url??`https://example.com/parity/${sourceId}`,title=input.title??'Synthetic source';
 const checkedAt=input.checkedAt??new Date(Date.now()-(input.age??0)*1000).toISOString(),snapshotId=createHash('sha256').update(revisionId).digest('hex');
 const passage=input.passage??input.quote;
 await db.query("INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity) VALUES($1,$2,$3,'independent_research',$4,'synthetic-parity')",[sourceId,identity.workspaceId,customerId,url]);
 await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,publication_at,retrieval_at,rights,audience,quality_input)
  VALUES($1,$2,$3,$4,1,$5,$6,$7,$7,$8,'2022-03-29',$9,'Synthetic fixture','delivery','{}')`,[revisionId,sourceId,identity.workspaceId,customerId,url,title,passage,createHash('sha256').update(passage).digest('hex'),checkedAt]);
 await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale) VALUES($1,'synthetic-parity','v1',true,true,true,true,'Synthetic fixture')`,[revisionId]);
 // This fixture concerns source readers. Record its already-assessed due state
 // so it does not consume an unrelated bounded maintenance batch in later suites.
 await db.query("INSERT INTO research_review_due(source_revision_id,environment_id,due_at,state) VALUES($1,$2,now(),'due')",[revisionId,identity.environmentId]);
 const source={id:'source-'+sourceId,url,title,excerpt:input.quote,retrievedAt:checkedAt};
 await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
  VALUES($1,$2,$3,$4,$5,$3,$6,false,$7,$7::timestamptz+interval '6 hours')`,[identity.environmentId,identity.workspaceId,snapshotId,input.fetchKey??'page:'+url,url,JSON.stringify(source),checkedAt]);
 await db.query(`INSERT INTO turas_evidence_accounts(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id,visibility) VALUES($1,$2,$3,$4,$5,$6,'public')`,[identity.environmentId,identity.workspaceId,input.owner??identity.userId,customerId,input.workload??'synthetic workload',snapshotId]);
 await db.query("INSERT INTO turas_evidence_passages(environment_id,workspace_id,snapshot_id,ordinal,text,model) VALUES($1,$2,$3,1,$4,'synthetic-keyword-only')",[identity.environmentId,identity.workspaceId,snapshotId,input.quote]);
 if(input.ledger!==false)await db.query(`INSERT INTO turas_public_learning(environment_id,workspace_id,account_id,id,source_id,snapshot_id,url,title,passage_id,quote,published_at,source_type,last_seen)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2022-03-29','customer_publication',$11)`,[identity.environmentId,identity.workspaceId,customerId,revisionId,source.id,snapshotId,url,title,source.id+':p1',input.quote,checkedAt]);
 return {sourceId,revisionId,snapshotId,url,checkedAt};
}
