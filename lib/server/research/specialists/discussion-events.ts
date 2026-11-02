import {tasks,calls,children,openInteractions,session,position,type SessionView,type FactPosition} from 'eve/events';
import type {SessionEvent} from 'eve/client';
import {withTransaction} from '../../db/client';
import {getServerConfig} from '../../config';
import {specialistOutcomeSchema} from './discussion-results';

const observed=new Set(['task.started','task.ended','call.started','call.settled','interaction.opened','interaction.settled','child.opened','session.ended']);
const terminal=new Set(['completed','failed','cancelled','unavailable']);
const workers={ 'customer-update':'customer-recon-worker',solution:'implementation-research-worker','best-practices':'vercel-best-practices-worker'};

/** Hooks supply the immutable view of the WHOLE committed line. Replay readers
 * must likewise fold a whole commit first. Only metadata is retained here; raw
 * call input/output, child messages, reasoning and native error text are ignored. */
export async function projectSpecialistFact(parentSessionId:string,event:SessionEvent,source:FactPosition,at:string,view:SessionView){
 if(!observed.has(event.type)||position(view)<=source.line)return;
 if(!Number.isSafeInteger(source.line)||!Number.isSafeInteger(source.index)||source.line<0||source.index<0)throw Error('Invalid specialist source position');
 const nativeTasks=tasks(view),nativeCalls=calls(view),nativeChildren=children(view),waiting=openInteractions(view),ended=session(view).status==='ended';
 await withTransaction(async db=>{
  const scope=(await db.query(`SELECT c.id FROM conversations c WHERE c.eve_session_id=$1 AND c.environment_id=$2 AND c.native_protocol=27
   AND EXISTS(SELECT 1 FROM specialist_discussions d WHERE d.conversation_id=c.id) FOR UPDATE`,[parentSessionId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
  if(!scope)return;
  const discussions=(await db.query(`SELECT * FROM specialist_discussions WHERE conversation_id=$1 AND closed_at IS NULL ORDER BY id FOR UPDATE`,[scope.id])).rows;
  for(const discussion of discussions){
   const task=nativeTasks.find(item=>item.callId===discussion.first_call_id||item.taskId===discussion.native_task_id);
   const child=nativeChildren.find(item=>item.callId===discussion.first_call_id&&item.name===workers[discussion.kind as keyof typeof workers]);
   if(task&&!discussion.native_task_id)await db.query('UPDATE specialist_discussions SET native_task_id=$2 WHERE id=$1',[discussion.id,task.taskId]);
   if(child&&!discussion.child_session_id)await db.query('UPDATE specialist_discussions SET child_session_id=$2 WHERE id=$1',[discussion.id,child.sessionId]);
   const newer=source.line>Number(discussion.projection_line)||source.line===Number(discussion.projection_line)&&source.index>discussion.projection_fact_index;
   const assignments=(await db.query('SELECT * FROM specialist_assignments WHERE discussion_id=$1 ORDER BY ordinal FOR UPDATE',[discussion.id])).rows;
   for(const assignment of assignments){
    const call=nativeCalls.find(item=>item.callId===assignment.call_id);
    let state:string|undefined;
    const result=specialistOutcomeSchema.safeParse(assignment.result_reference);
    const stoppedByOwner=discussion.state==='stopping'&&discussion.close_reason==='cancelled';
    const taskEndedHere=event.type==='task.ended'&&event.data.taskId===task?.taskId||event.type==='session.ended';
    if(stoppedByOwner&&!terminal.has(assignment.state)&&taskEndedHere){
     state=call?.outcome==='completed'&&result.success&&result.data.status!=='unavailable'?'completed':'cancelled';
    }else if(stoppedByOwner&&call?.outcome==='completed'&&!(result.success&&result.data.status!=='unavailable')){
     // A cooperative Stop reply alone is not terminal proof. Wait for the
     // native task end before confirming that the workflow and child closed.
    }else if(call?.outcome&&(event.type==='call.settled'&&event.data.callId===assignment.call_id||event.type==='task.ended'&&event.data.taskId===task?.taskId||event.type==='session.ended')){
     state=call.outcome==='completed'?(result.success&&result.data.status!=='unavailable'?'completed':'unavailable'):call.outcome==='interrupted'?'cancelled':'failed';
    }else if((event.type==='task.ended'&&event.data.taskId===task?.taskId||event.type==='session.ended')&&!terminal.has(assignment.state)){
     state=assignment.result_reference?'unavailable':task?.outcome==='failed'?'failed':task?.outcome==='cancelled'||ended?'cancelled':'unavailable';
    }
    if(state&&!terminal.has(assignment.state)){
     await db.query(`UPDATE specialist_assignments SET state=$2,terminal_line=COALESCE(terminal_line,$3),terminal_index=COALESCE(terminal_index,$4),
      result_delivered_at=CASE WHEN $5::boolean THEN COALESCE(result_delivered_at,$6::timestamptz) ELSE result_delivered_at END,updated_at=GREATEST(updated_at,$6::timestamptz)
      WHERE id=$1`,[assignment.id,state,source.line,source.index,call?.outcome==='completed',at]);
    }else if(newer&&!terminal.has(assignment.state)&&assignment.state!=='stopping'){
     const activeTask=task?.taskId??discussion.native_task_id;
     const next=waiting.some(item=>item.taskId===activeTask)?'waiting_input':call?'working':assignment.state;
     if(next!==assignment.state)await db.query('UPDATE specialist_assignments SET state=$2,updated_at=GREATEST(updated_at,$3::timestamptz) WHERE id=$1',[assignment.id,next,at]);
    }
   }
   if(event.type==='task.ended'&&event.data.taskId===task?.taskId||event.type==='session.ended'){
    const state=discussion.state==='failed'?'failed':discussion.close_reason==='expired'?'expired':task?.outcome==='failed'?'failed':'closed';
    await db.query(`UPDATE specialist_discussions SET state=$2,closed_at=COALESCE(closed_at,$3::timestamptz),close_reason=COALESCE(close_reason,$4),version=version+1
     WHERE id=$1 AND closed_at IS NULL`,[discussion.id,state,at,task?.outcome??'session-ended']);
   }
   if(newer)await db.query('UPDATE specialist_discussions SET projection_line=$2,projection_fact_index=$3 WHERE id=$1',[discussion.id,source.line,source.index]);
  }
 });
}
