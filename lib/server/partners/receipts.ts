import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { partnerContractVersion, partnerId, type PartnerReceipt } from "../../contracts/partners";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { partnerHash, partnerTransaction } from "./repository";
import { lockPartnerActor, requirePartnerAction, type PartnerActor } from "./policy";
import { partnerRate } from "./rate";
export const partnerActorHash=(actor:PartnerActor)=>partnerHash([getServerConfig().TURAS_ENVIRONMENT_ID,actor.principalId,actor.membershipId]);
export async function lockPartnerRequest(db:PoolClient,actor:PartnerActor,requestId:string,wait=true){
  const key=partnerHash([getServerConfig().TURAS_ENVIRONMENT_ID,partnerActorHash(actor),requestId]);
  if(wait){await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]);return true;}
  return Boolean((await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",[key])).rows[0].locked);
}
type Row={request_id:string;action:string;target_id:string|null;version:string|null;outcome:PartnerReceipt['outcome'];created_at:Date|null;input_digest:string;customer_id:string|null;workspace_id:string};
export const projectPartnerReceipt=(row:Row):PartnerReceipt=>({contractVersion:partnerContractVersion,requestId:row.request_id,action:row.action,targetId:row.target_id,version:row.version===null?null:Number(row.version),outcome:row.outcome,committedAt:row.created_at?.toISOString()??null});
export async function assertPartnerPreviewReceipt(db:PoolClient,actor:PartnerActor,row:Row){if(!row.action.startsWith("preview.")||row.outcome!=="committed")return;const preview=(await db.query("SELECT expires_at FROM partner_review_previews WHERE id=$1 AND actor_membership_id=$2 AND session_id=$3",[row.target_id,actor.membershipId,actor.sessionId])).rows[0];if(!preview||preview.expires_at.getTime()<=Date.now())throw new HttpFailure(410,"preview_expired","Prepare a new review preview");}
export async function findPartnerReceipt(db:PoolClient,actor:PartnerActor,requestId:string){return (await db.query<Row>("SELECT * FROM partner_commands WHERE environment_id=$1 AND actor_hash=$2 AND request_id=$3",[getServerConfig().TURAS_ENVIRONMENT_ID,partnerActorHash(actor),requestId])).rows[0];}
export async function replayPartnerReceipt(db:PoolClient,actor:PartnerActor,requestId:string,digest:string){
  const prior=await findPartnerReceipt(db,actor,requestId);if(!prior)return null;
  if(prior.customer_id)await lockPartnerActor(db,actor,prior.customer_id);
  if(prior.outcome!=="committed")throw new HttpFailure(410,"request_retired","This request cannot be repeated");
  if(prior.input_digest!==digest)throw new HttpFailure(409,"request_conflict","Request identity was already used");
  await assertPartnerPreviewReceipt(db,actor,prior);
  return projectPartnerReceipt(prior);
}
export async function storePartnerReceipt(db:PoolClient,actor:PartnerActor,input:{requestId:string;action:string;digest:string;customerId:string|null;targetId:string|null;version:number|null;outcome?:"committed"|"abandoned"}){
  const row=(await db.query<Row>(`INSERT INTO partner_commands(id,environment_id,workspace_id,actor_hash,actor_membership_id,request_id,action,input_digest,customer_id,target_id,version,outcome)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,partnerActorHash(actor),actor.membershipId,input.requestId,input.action,input.digest,input.customerId,input.targetId,input.version,input.outcome??"committed"])).rows[0];
  return projectPartnerReceipt(row);
}
export async function readPartnerRequest(actor:PartnerActor,requestId:string,resolveAbsent=false){
  partnerId.parse(requestId);
  await partnerTransaction(async db=>{await lockPartnerActor(db,actor);await partnerRate(db,actor,resolveAbsent?"write":"read");});
  return partnerTransaction(async db=>{
    await lockPartnerActor(db,actor);
    const priorScope=await findPartnerReceipt(db,actor,requestId);
    if(priorScope)requirePartnerAction(actor,priorScope.action,actor.membershipId);
    if(priorScope?.customer_id)await lockPartnerActor(db,actor,priorScope.customer_id);
    if(!await lockPartnerRequest(db,actor,requestId,false))return {contractVersion:partnerContractVersion,requestId,outcome:"pending" as const};
    const prior=await findPartnerReceipt(db,actor,requestId);
    if(prior){if(prior.customer_id&&!priorScope)await lockPartnerActor(db,actor,prior.customer_id);await assertPartnerPreviewReceipt(db,actor,prior);return projectPartnerReceipt(prior);}
    if(!resolveAbsent)return {contractVersion:partnerContractVersion,requestId,outcome:"not_found" as const};
    return storePartnerReceipt(db,actor,{requestId,action:"request.resolve",digest:partnerHash(["abandoned",requestId]),customerId:null,targetId:null,version:null,outcome:"abandoned"});
  });
}
