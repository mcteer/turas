import {protectedCancellationRequest} from '../../lib/server/operations/admission';
import {ownedInputResponseAttempt} from "../../lib/server/conversations/input-responses";
import { eveChannel } from "eve/channels/eve";
import type { AuthFn } from "eve/channels/auth";
import { getCurrentSession } from "../../lib/server/auth/sessions";
import { composeEveRoutes } from "../../lib/server/conversations/eve-routes";
import { deriveNativeAttempt } from "../../lib/server/conversations/dispatch";
import { HttpFailure } from "../../lib/contracts/http";
import { authorizeExecutionRetirement } from "../../lib/server/execution/native-retirement";
import {authorizeExpansionRetirement} from "../../lib/server/expansion/native-retirement";
import { authorizeSupportRetirement } from "../../lib/server/support/native-retirement";
import { authorizeNativeRetirement } from "../../lib/server/artifacts/native-retirement";
import { authorizeLearningRetirement } from '../../lib/server/learning/native-retirement';

import {authorizeOrdinaryNativeRetirementRecovery} from "../../lib/server/conversations/native-retirement-recovery";

const appCookieAuth: AuthFn<Request> = async (request): Promise<Awaited<ReturnType<AuthFn<Request>>>> => {
  const retirementSession = new URL(request.url).pathname.match(/^\/eve\/v1\/session\/(wrun_[A-Za-z0-9_-]+)\/(?:reset|end)$/);
  if (request.method === "POST" && retirementSession) {
    const principalId = await authorizeOrdinaryNativeRetirementRecovery(request,retirementSession[1]) ?? await authorizeNativeRetirement(request,retirementSession[1]) ?? await authorizeExecutionRetirement(request,retirementSession[1]) ?? await authorizeSupportRetirement(request,retirementSession[1]) ?? await authorizeExpansionRetirement(request,retirementSession[1]) ?? await authorizeLearningRetirement(request,retirementSession[1]);
    if (principalId) return { authenticator: "turas-source-retirement",
      principalId, principalType: "user", attributes: {} };
  }
  const session = await getCurrentSession(request,protectedCancellationRequest(request)?"cancellation":"ordinary");
  if (!session) return null;
  let pendingAttempt:string|undefined;
  const continuation=new URL(request.url).pathname.match(/^\/eve\/v1\/session\/(wrun_[A-Za-z0-9_-]+)$/);
  if(request.method==='POST' && continuation) {
    const body:unknown=await request.clone().json().catch(()=>null);
    if(body && typeof body==='object' && ('answers' in body||'inputResponses' in body)) {
      pendingAttempt=await ownedInputResponseAttempt(session,continuation[1],body).catch(()=>undefined);
      if(!pendingAttempt)return null;
    }
  }
  return {
    authenticator: "turas-session",
    principalId: session.principalId,
    principalType: "user",
    attributes: { workspaceId: session.workspaceId,turasLoginSessionId:session.sessionId,turasMembershipId:session.membershipId,...(pendingAttempt?{turasAttemptId:pendingAttempt}:{}) },
  };
};

export default composeEveRoutes(eveChannel({
  auth: [appCookieAuth],
  uploadPolicy: process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED==='1'?{maxBytes:10*1024*1024,allowedMediaTypes:"*"}:"disabled",
  turnPolicy: "queue",
  async onMessage(ctx, message) {
    if (!ctx.eve.caller || (typeof message !== "string"&&!Array.isArray(message)) || !ctx.eve.sessionId) {
      throw new HttpFailure(403, "invalid_dispatch", "Action not allowed");
    }
    const requestKey = ctx.eve.request.headers.get("x-turas-request-key");
    if (!requestKey) throw new HttpFailure(403, "invalid_dispatch", "Action not allowed");
    const session = await getCurrentSession(ctx.eve.request);
    if (!session || session.principalId !== ctx.eve.caller.principalId) {
      throw new HttpFailure(403, "invalid_dispatch", "Action not allowed");
    }
    // Staged uploads reach Eve as exact bounded summaries of the immutable
    // original parts. The outer route verifies owned bytes before dispatch;
    // the provider middleware hydrates them again under current authority.
    const attemptId = await deriveNativeAttempt(session, ctx.eve.sessionId, requestKey, message,{trustedHydrated:true});
    return { auth: { ...ctx.eve.caller,
      attributes: { ...ctx.eve.caller.attributes, turasAttemptId: attemptId } } };
  },
}));
