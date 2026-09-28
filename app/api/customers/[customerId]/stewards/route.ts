import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../lib/server/auth/sessions";
import { listCustomerStewards } from "../../../../../lib/server/profiles/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request,
  context: { params: Promise<{ customerId: string }> }): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { customerId } = await context.params;
    if (!z.uuid().safeParse(customerId).success) throw new HttpFailure(422, "invalid_input", "Invalid request");
    return success(await listCustomerStewards(session, customerId));
  } catch (error) { return failure(error); }
}
