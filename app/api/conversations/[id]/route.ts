import { archiveConversationSchema } from "../../../../lib/contracts/conversations";
import { checkSessionCsrf } from "../../../../lib/server/auth/csrf";
import { setOwnedConversationArchived } from "../../../../lib/server/conversations/repository";
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    checkSessionCsrf(request, session);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    if (Number(request.headers.get("content-length") ?? 0) > 1024) throw new HttpFailure(413, "too_large", "Request too large");
    const input = archiveConversationSchema.safeParse(await request.json());
    if (!input.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    return success(await setOwnedConversationArchived(session, id, input.data.archived));
  } catch (error) { return failure(error); }
}
