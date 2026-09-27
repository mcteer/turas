import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../../lib/contracts/http";
import { requireAdminSession } from "../../../../../../lib/server/access/admin-guard";
import { checkSessionCsrf } from "../../../../../../lib/server/auth/csrf";
import { setPartnerGrant } from "../../../../../../lib/server/access/service";

const inputSchema = z.object({
  state: z.enum(["active", "revoked"]),
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.uuid(),
}).strict();

export async function PUT(
  request: Request,
  context: { params: Promise<{ membershipId: string; customerId: string }> },
): Promise<Response> {
  try {
    const session = await requireAdminSession(request);
    checkSessionCsrf(request, session);
    const { membershipId, customerId } = await context.params;
    if (!z.uuid().safeParse(membershipId).success || !z.uuid().safeParse(customerId).success) {
      throw new HttpFailure(422, "invalid_input", "Invalid request");
    }
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const result = await setPartnerGrant({
      ...parsed.data, membershipId, customerId,
      actorPrincipalId: session.principalId, actorSessionId: session.sessionId,
    });
    return success(result);
  } catch (error) {
    return failure(error);
  }
}
