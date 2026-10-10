'use client';
import {useRef,useState} from 'react';
import type {readLearningEvaluation} from '../../../lib/server/learning/evaluation-captures';
import {learningEvaluationPrompt} from '../../../lib/contracts/learning';
import {learningPost,type LearningAuth} from './client';
import {useLearningMutation} from './view';
type Evaluation=Awaited<ReturnType<typeof readLearningEvaluation>>;
export function LearningEvaluationControls({view,auth,refresh,clear,onNotice}:{view:Evaluation;auth:LearningAuth;refresh:()=>Promise<void>;clear:()=>void;onNotice:(message:string)=>void}){
 const command=useLearningMutation(auth,`evaluation:${view.id}`,refresh),dispatching=useRef(false),[busy,setBusy]=useState(false),setNotice=onNotice;
 const arms=view.cases.flatMap(item=>item.arms),active=arms.find(arm=>!['completed','missing'].includes(arm.state)),blocked=busy||command.busy||!!command.pending;
 async function start(){
  if(!active||!('id' in active)||active.state!=='prepared'||dispatching.current)return;dispatching.current=true;setBusy(true);clear();
  try{const session=await learningPost<{sessionId:string}>(auth,'/eve/v1/session',{operationId:active.operationId},{'x-turas-conversation-id':active.conversationId});
   const response=await fetch(`/eve/v1/session/${encodeURIComponent(session.sessionId)}`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':auth.csrfToken,'x-turas-conversation-id':active.conversationId,'x-turas-request-key':active.nativeRequestId},body:JSON.stringify({message:learningEvaluationPrompt})});await response.body?.cancel();if(!response.ok)throw Error('Arm dispatch unconfirmed. Check evaluation status before continuing.');setNotice('Arm started. Check status for its confirmed capture.');
  }catch(error){setNotice(error instanceof Error?error.message:'Dispatch unconfirmed');}finally{dispatching.current=false;setBusy(false);await refresh();}
 }
 return <section className="profile-card"><h2>Evaluation Controls</h2>{view.canAdvance&&!active&&arms.some(arm=>arm.state==='missing')&&<button className="primary-button" disabled={blocked} onClick={async()=>{try{await command.mutate(`/api/learning/evaluations/${view.id}/arms`,{expectedVersion:view.version,rationale:'Operator prepared the next fixed sequential evaluation arm'});}catch(error){setNotice(error instanceof Error?error.message:'Arm preparation unavailable');}}}>Prepare Next Fixed Arm</button>}{view.canAdvance&&active?.state==='prepared'&&'preparedUntil' in active&&<button className="primary-button" disabled={blocked||Date.parse(active.preparedUntil)<=Date.now()} onClick={()=>void start()}>Start Prepared Evaluation Arm</button>}
 {['prepared','running','unconfirmed'].includes(view.state)&&<button className="secondary-button" disabled={blocked} onClick={async()=>{try{await command.mutate(`/api/learning/evaluations/${view.id}/cancel`,{expectedVersion:view.version,rationale:'Operator cancelled the paired evaluation'});if(active&&'nativeSessionId' in active&&active.nativeSessionId&&active.nativeTurnId)try{await learningPost(auth,`/eve/v1/session/${encodeURIComponent(active.nativeSessionId)}/cancel`,{turnId:active.nativeTurnId},{'x-turas-conversation-id':active.conversationId});}catch{/* Durable cancellation already fences subsequent output. */}}catch(error){setNotice(error instanceof Error?error.message:'Cancellation unconfirmed');}}}>Cancel Full Evaluation</button>}{command.notice&&<p role="status">{command.notice}</p>}{command.pending&&<><button className="secondary-button" disabled={command.busy} onClick={()=>void command.reconcile()}>Check Evaluation Request Status</button><button className="secondary-button" disabled={command.busy} onClick={()=>void command.reconcile(true)}>Close Evaluation Request</button></>}</section>;
}
