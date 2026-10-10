import { HttpFailure } from "../../contracts/http";
import { getCurrentSession, type CurrentSession } from "../auth/sessions";
import { DEMO_IDS } from "../bootstrap-ids";
import { isMcpReadActor,type CurrentReadActor } from "../auth/read-actor";

export function isCanonicalAdmin(actor:CurrentReadActor):boolean {
  return !isMcpReadActor(actor) && actor.kind==='internal' && actor.role==='admin' && actor.principalId===DEMO_IDS.mcteer;
}

export async function requireAdminSession(request: Request): Promise<CurrentSession> {
  const session = await getCurrentSession(request);
  if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
  if (session.kind !== "internal" || session.role !== "admin") {
    throw new HttpFailure(403, "forbidden", "Action not allowed");
  }
  return session;
}
