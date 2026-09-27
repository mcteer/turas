import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { listCustomers } from "../../../lib/server/access/customers";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "25");
    return success(await listCustomers(session, limit, url.searchParams.get("cursor")));
  } catch (error) {
    return failure(error);
  }
}
