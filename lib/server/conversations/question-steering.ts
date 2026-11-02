import type {AttachSessionFn} from 'eve/channels';
import type {SessionStreamEvent} from 'eve/client';
import {emptySessionView,foldEvents} from 'eve/events';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';
import {pendingOwnedQuestionTurn} from './input-responses';
import {requestCancellation} from './cancel';
import {projectEveFact} from './eve-events';
import {projectNativeEvent} from './projection';

/** Native steering withdraws open questions and approvals. An explicit
 * replacement first stops that owned input turn; only a real terminal commit
 * permits a new attempt. No cancelled allowance is reopened or renewed. */
export async function stopOwnedQuestionsForSteering(actor:CurrentSession,id:string,attach:AttachSessionFn){
 const pending=await pendingOwnedQuestionTurn(actor,id);if(!pending)return;
 await requestCancellation(actor,id,pending.turnId);
 await attach(id).cancel({turnId:pending.turnId});
 let view=emptySessionView(),terminal:SessionStreamEvent|undefined;
 try{
  for await(const event of attach(id).stream({startIndex:0,follow:true,signal:AbortSignal.timeout(10000)})){
   if(event.meta.position.line>10000)throw Error('Native question history limit');
   view=foldEvents(view,[event]);
   if(event.type==='turn.settled'&&event.data.turnId===pending.turnId)terminal=event;
   if(terminal&&event.meta.endOfLine){
    await projectNativeEvent(id,pending.attemptId,projectEveFact(id,terminal,terminal.meta.position,terminal.meta.at,view),terminal.meta.position.line);
    return;
   }
  }
 }catch{/* An unconfirmed stop never forwards the replacement or renews budget. */}
 throw new HttpFailure(503,'question_stop_unconfirmed','The pending response has not confirmed its stop. Reload to check before sending again.');
}
