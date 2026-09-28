import { z } from "zod";
import { randomUUID } from "node:crypto";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../lib/server/auth/sessions";
import { checkSessionCsrf } from "../../../../../lib/server/auth/csrf";
import { submitProfileCommandDetailed } from "../../../../../lib/server/profiles/service";
import { recordOperationalEvent } from "../../../../../lib/server/observability";

export const dynamic = "force-dynamic";
export async function POST(request: Request,
  context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  const started = Date.now();
  const correlationId = randomUUID();
  let actorId: string | undefined;
  let workspaceId: string | undefined;
  let customerId: string | undefined;
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    actorId = session.principalId;
    workspaceId = session.workspaceId;
    checkSessionCsrf(request, session);
    ({ customerId } = await context.params);
    if (!z.uuid().safeParse(customerId).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    if (Number(request.headers.get("content-length") ?? 0) > 65_536) {
      throw new HttpFailure(413, "too_large", "Profile command is too large");
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > 65_536) throw new HttpFailure(413, "too_large", "Profile command is too large");
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { throw new HttpFailure(422, "invalid_input", "Invalid JSON"); }
    const result = await submitProfileCommandDetailed(session, customerId, input);
    recordOperationalEvent({ action: "profile_command", outcome: "allowed",
      correlationId, actorId, workspaceId, customerId, durationMs: Date.now() - started });
    return success(result.data, result.status, correlationId);
  } catch (error) {
    recordOperationalEvent({ action: "profile_command",
      outcome: error instanceof HttpFailure && error.status < 500 ? "denied" : "failed",
      correlationId, actorId, workspaceId, customerId,
      errorCode: error instanceof HttpFailure ? error.code : "unavailable",
      durationMs: Date.now() - started });
    return failure(error, correlationId);
  }
}
