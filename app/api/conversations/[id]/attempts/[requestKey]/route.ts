import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../../lib/server/auth/sessions";
import { getOwnedAttemptStatus } from "../../../../../../lib/server/conversations/repository";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; requestKey: string }> },
): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { id, requestKey } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(requestKey).success) {
      throw new HttpFailure(422, "invalid_input", "Invalid request");
    }
    return success(await getOwnedAttemptStatus(session, id, requestKey));
  } catch (error) {
    return failure(error);
  }
}
