import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../lib/server/auth/sessions";
import { getOwnedConversationDetail } from "../../../../lib/server/conversations/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    return success(await getOwnedConversationDetail(session, id));
  } catch (error) {
    return failure(error);
  }
}
