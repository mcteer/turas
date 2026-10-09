import type { PoolClient } from "pg";
import { partnerId, partnerVersion, type PartnerCommandBase } from "../../contracts/partners";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { partnerHash, partnerTransaction } from "./repository";
import { lockPartnerActor, requirePartnerEnabled, requirePartnerAction, type PartnerActor } from "./policy";
import { lockPartnerRequest, replayPartnerReceipt, storePartnerReceipt, partnerActorHash } from "./receipts";
import { partnerRate } from "./rate";
export { partnerRate } from "./rate";
export type PartnerCommandScope={customerId:string;targetMembershipId?:string};
export async function partnerRead<T>(actor:PartnerActor,customerId:string|undefined,run:(db:PoolClient)=>Promise<T>,targetMemberId?:string){
  await partnerTransaction(async db=>{await lockPartnerActor(db,actor,customerId,targetMemberId,false,true);await partnerRate(db,actor,"read");});
  return partnerTransaction(async db=>{await lockPartnerActor(db,actor,customerId,targetMemberId,false,true);return run(db);});
}
export async function partnerCommand<T extends PartnerCommandBase>(actor:PartnerActor,input:T,scope:PartnerCommandScope,
  run:(db:PoolClient)=>Promise<{targetId:string;version:number}>){
  partnerId.parse(input.requestId);partnerVersion.parse(input.expectedVersion);requirePartnerAction(actor,input.action,scope.targetMembershipId);const digest=partnerHash(input);
  await partnerTransaction(async db=>{
    await lockPartnerActor(db,actor,scope.customerId,scope.targetMembershipId);
    await lockPartnerRequest(db,actor,input.requestId);
    const prior=await replayPartnerReceipt(db,actor,input.requestId,digest);
    if(!prior)requirePartnerEnabled(input.action);await partnerRate(db,actor,prior?"read":"write");
  });
  return partnerTransaction(async db=>{
    await lockPartnerActor(db,actor,scope.customerId,scope.targetMembershipId,true);requirePartnerAction(actor,input.action,scope.targetMembershipId);
    await lockPartnerRequest(db,actor,input.requestId);const prior=await replayPartnerReceipt(db,actor,input.requestId,digest);if(prior)return prior;
    requirePartnerEnabled(input.action);const result=await run(db);
    return storePartnerReceipt(db,actor,{requestId:input.requestId,action:input.action,digest,customerId:scope.customerId,...result});
  });
}
