import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../lib/server/auth/sessions";
import { listProfileRecords } from "../../../../../lib/server/profiles/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request,
  context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { customerId } = await context.params;
    if (!z.uuid().safeParse(customerId).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    const url = new URL(request.url);
    const allowed = new Set(["kind", "workloadId", "state", "query", "cursor", "limit"]);
    for (const key of url.searchParams.keys()) if (!allowed.has(key)) {
      throw new HttpFailure(422, "invalid_query", "Invalid profile query");
    }
    return success(await listProfileRecords(session, customerId,
      Object.fromEntries(url.searchParams.entries())));
  } catch (error) { return failure(error); }
}
