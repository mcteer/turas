import { createConversationSchema, listConversationSchema } from "../../../lib/contracts/conversations";
import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { checkSessionCsrf } from "../../../lib/server/auth/csrf";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { createOwnedConversation, listOwnedConversations } from "../../../lib/server/conversations/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const input = listConversationSchema.safeParse(params);
    if (!input.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    return success(await listOwnedConversations(session, input.data));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    checkSessionCsrf(request, session);
    if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024) {
      throw new HttpFailure(413, "too_large", "Request too large");
    }
    const input = createConversationSchema.safeParse(await request.json());
    if (!input.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const result = await createOwnedConversation(session, input.data);
    return success(result.conversation, result.created ? 201 : 200);
  } catch (error) {
    return failure(error);
  }
}
