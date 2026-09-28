import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { listCustomers } from "../../../lib/server/access/customers";
import { checkSessionCsrf } from "../../../lib/server/auth/csrf";
import { createCustomerAnchor } from "../../../lib/server/profiles/customer-create";

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


export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    checkSessionCsrf(request, session);
    if (Number(request.headers.get("content-length") ?? 0) > 65_536) {
      throw new HttpFailure(413, "too_large", "Customer proposal is too large");
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > 65_536) throw new HttpFailure(413, "too_large", "Customer proposal is too large");
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { throw new HttpFailure(422, "invalid_input", "Invalid JSON"); }
    const result = await createCustomerAnchor(session, input);
    return success(result.data, result.status);
  } catch (error) { return failure(error); }
}
