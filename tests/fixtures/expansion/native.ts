import {randomUUID} from 'node:crypto';
import {prepareExpansionAdvice} from '../../../lib/server/expansion/advisory';
import {prepareAttempt,claimDispatch} from '../../../lib/server/conversations/dispatch';
import {projectNativeEvent,type NativeEvent} from '../../../lib/server/conversations/projection';
import {expansionAdvicePrompt} from '../../../lib/expansion/advice';
import {getServerConfig} from '../../../lib/server/config';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../../lib/server/auth/sessions';
import {withExpansionDatabase} from './environment';
/** Domain-native fixture uses real preparation/dispatch/admission/event handlers.
 * It does not establish that the eve framework ran; check-expansion-native does. */
export async function startExpansionNative(actor:CurrentSession,sourceRefs:import("../../../lib/server/expansion/schema").ExpansionSource[]=[]){
 const workloadId=randomUUID();
 await withExpansionDatabase(db=>db.query("INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name) VALUES($1,$2,$3,'Synthetic native scope')",[workloadId,actor.workspaceId,DEMO_IDS.sharedCustomer]));
 const prepared=await prepareExpansionAdvice(actor,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',expectedVersion:0,requestKey:randomUUID(),workloadId,question:'What should the operating owner validate?',selectedEngagementIds:[],selectedHypothesisIds:[],sourceRefs});
 const nativeSessionId=`wrun_synthetic_${randomUUID().replaceAll('-','')}`,turnId=`turn_${randomUUID().replaceAll('-','')}`;
 await withExpansionDatabase(async db=>{
  await db.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[prepared.conversationId,nativeSessionId]);
  await db.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'expansion-native-domain-fixture',clock_timestamp())
   ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at`,[getServerConfig().TURAS_ENVIRONMENT_ID]);
 });
 const response=await prepareAttempt(actor,prepared.conversationId,nativeSessionId,prepared.nativeRequestId,expansionAdvicePrompt);
 await claimDispatch(actor,prepared.conversationId,response.attemptId,0);
 let index=0;
 const event=async(type:string,data:Record<string,unknown>={})=>projectNativeEvent(nativeSessionId,response.attemptId,{type,meta:{id:`evt_${randomUUID()}`,at:new Date().toISOString()},data:{turnId,...data}} as NativeEvent,index++);
 await event('message.received',{message:expansionAdvicePrompt});
 return {...prepared,responseAttemptId:response.attemptId,nativeSessionId,turnId,workloadId,event,
  principal:{principalId:actor.principalId,attributes:{turasAttemptId:response.attemptId}},identity:{nativeSessionId,responseAttemptId:response.attemptId,turnId,stepIndex:0}};
}
