import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {hiddenRecord} from '../../contracts/http';
import {learningId} from '../../contracts/learning';
import {getServerConfig} from '../config';
import {learningPublicationState} from './releases';
import {lockLearningPublisher} from './policy';
import {lockLearningRequest,findLearningReceipt,checkLearningReplay,learningInputDigest,storeLearningReceipt} from './receipts';
type DecisionCommand={idempotencyKey:string};
type Admission={requestId:string;action:string;digest:string;customerId:string;prior:boolean};
/** Extend UUID-keyed 005 decisions with the same status/abandon mutex as learning.
 * Existing non-UUID 005 keys retain their original compatibility contract. */
export async function admitLearningKnowledgeDecision(db:PoolClient,actor:CurrentSession,targetId:string,action:'publish'|'withdraw',command:DecisionCommand):Promise<Admission|null>{
 if(!learningId.safeParse(command.idempotencyKey).success||!(await learningPublicationState(db,actor.workspaceId))?.activatedAt)return null;
 await lockLearningPublisher(db,actor);await lockLearningRequest(db,actor,command.idempotencyKey);
 const sql=action==='publish'?'SELECT customer_id FROM knowledge_contributions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3':`SELECT c.customer_id FROM knowledge_publications p JOIN knowledge_contributions c ON c.id=p.contribution_id WHERE p.id=$1 AND p.environment_id=$2 AND c.workspace_id=$3`;
 const header=(await db.query(sql,[targetId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!header)throw hiddenRecord();await lockLearningPublisher(db,actor,header.customer_id);
 const prior=await findLearningReceipt(db,actor,command.idempotencyKey),value={targetId,command},digest=learningInputDigest(value,prior?.hash_key_id),receiptAction=`release.${action}`;
 if(prior)checkLearningReplay(prior,digest,receiptAction);
 return {requestId:command.idempotencyKey,action:receiptAction,digest,customerId:header.customer_id as string,prior:!!prior};
}
export async function finishLearningKnowledgeDecision(db:PoolClient,actor:CurrentSession,admission:Admission|null,decisionId:string,generation:number){
 if(admission&&!admission.prior)await storeLearningReceipt(db,actor,{requestId:admission.requestId,action:admission.action,digest:admission.digest,customerId:admission.customerId,targetId:decisionId,version:generation});
}
