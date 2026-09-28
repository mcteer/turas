import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../lib/server/auth/sessions";
import { listOwnSubmissions } from "../../../../../lib/server/profiles/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request,
  context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { customerId } = await context.params;
    if (!z.uuid().safeParse(customerId).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const url = new URL(request.url);
    for (const key of url.searchParams.keys()) if (key !== "limit" && key !== "cursor") {
      throw new HttpFailure(422, "invalid_query", "Invalid query");
    }
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined;
    return success(await listOwnSubmissions(session, customerId,
      { limit, cursor: url.searchParams.get("cursor") ?? undefined }));
  } catch (error) { return failure(error); }
}
