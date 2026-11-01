import {defineHook} from 'eve/hooks';
import {withTransaction} from '../../../lib/server/db/client';
import {authorizeSpecialistWorker} from '../../../lib/server/research/specialists/discussions';
import type {SpecialistKind} from '../../../lib/contracts/specialist-discussions';
import {researchState} from './research-state';

export function researchTurnHook(kind:SpecialistKind){
 return defineHook({events:{async 'turn.started'(_event,ctx){
  const principal=ctx.session.auth.current,attemptId=principal?.attributes?.turasAttemptId,parent=ctx.session.parent;
  if(!principal?.principalId||typeof attemptId!=='string'||!parent)throw Error('Owned research authority required');
  const bound=await withTransaction(db=>authorizeSpecialistWorker(db,{kind,attemptId,principalId:principal.principalId!,parentSessionId:parent.sessionId,workerSessionId:ctx.session.id}));
  const assignment=await withTransaction(async db=>(await db.query('SELECT research_key,lease_id FROM specialist_assignments WHERE id=$1',[bound.assignmentId])).rows[0]);
  const state=researchState.get();
  if(state.requestTicket?.lease===assignment.lease_id)return;
  researchState.update(current=>({...current,context:null,mode:kind,requestTicket:{key:assignment.research_key,lease:assignment.lease_id},requestScope:undefined,
   finalized:false,customerRecon:undefined,customerUpdateRevisionCallId:undefined,solutionRevisionCallId:undefined,
   startedAt:bound.discussion.created_at.getTime()}));
 }} });
}
