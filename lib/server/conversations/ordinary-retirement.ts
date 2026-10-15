import {z} from 'zod';
import {getCurrentSession} from '../auth/sessions';
import {checkSessionCsrf} from '../auth/csrf';
import {HttpFailure} from '../../contracts/http';
import {requestOwnedTaskCancellation,settleInactiveOwnedCancellation} from './cancel';

/** Restore the legacy owner-only native retirement control. Closing the owned
 * ordinary research admission precedes forwarding; no synthetic source or
 * governed-workflow retirement authority is manufactured for cleanup. */
export async function authorizeOwnedOrdinaryRetirement(request:Request,nativeSessionId:string){
 const actor=await getCurrentSession(request);if(!actor)return null;
 checkSessionCsrf(request,actor);
 const raw=await request.clone().text();
 if(Buffer.byteLength(raw)>2048)throw new HttpFailure(413,'retirement_too_large','Invalid retirement request');
 let input:unknown;try{input=raw.trim()?JSON.parse(raw):{};}catch{throw new HttpFailure(422,'invalid_input','Invalid retirement request');}
 if(!z.object({reason:z.string().max(500).optional()}).strict().safeParse(input).success)throw new HttpFailure(422,'invalid_input','Invalid retirement request');
 await requestOwnedTaskCancellation(actor,nativeSessionId);
 return actor.principalId;
}

/** Only Eve's terminal retirement receipt proves a parked ordinary turn stopped.
 * A successful HTTP status or accepted request alone cannot settle admission. */
export async function reconcileOwnedOrdinaryRetirement(request:Request,nativeSessionId:string,response:Response){
 if(!response.ok)return;
 const receipt=z.discriminatedUnion('status',[
  z.object({ok:z.literal(true),status:z.literal('reset'),previousSessionId:z.literal(nativeSessionId)}),
  z.object({ok:z.literal(true),status:z.literal('no_active_session')}),
 ]).safeParse(await response.clone().json().catch(()=>null));
 if(!receipt.success)return;
 const actor=await getCurrentSession(request);if(!actor)return;
 checkSessionCsrf(request,actor);
 await settleInactiveOwnedCancellation(actor,nativeSessionId);
}
