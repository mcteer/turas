import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { requireAdminSession } from "../../../../../lib/server/access/admin-guard";
import { checkSessionCsrf } from "../../../../../lib/server/auth/csrf";
import { setMembershipActive } from "../../../../../lib/server/access/service";

const inputSchema = z.object({
  active: z.boolean(),
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.uuid(),
}).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await requireAdminSession(request);
    checkSessionCsrf(request, session);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const result = await setMembershipActive({
      ...parsed.data, membershipId: id,
      actorPrincipalId: session.principalId, actorSessionId: session.sessionId,
    });
    return success(result);
  } catch (error) {
    return failure(error);
  }
}
