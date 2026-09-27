import { HttpFailure } from "../../contracts/http";
import { getCurrentSession, type CurrentSession } from "../auth/sessions";

export async function requireAdminSession(request: Request): Promise<CurrentSession> {
  const session = await getCurrentSession(request);
  if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
  if (session.kind !== "internal" || session.role !== "admin") {
    throw new HttpFailure(403, "forbidden", "Action not allowed");
  }
  return session;
}
