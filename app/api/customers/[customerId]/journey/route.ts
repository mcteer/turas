import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../lib/server/auth/sessions";
import { readJourneyPage } from "../../../../../lib/server/profiles/journey-page";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { customerId } = await context.params;
    const query = z.object({ query: z.string().max(200).optional(), cursor: z.string().max(500).optional() }).strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!z.uuid().safeParse(customerId).success || !query.success)
      throw new HttpFailure(422, "invalid_query", "Invalid journey query");
    return success(await readJourneyPage(actor, customerId, query.data));
  } catch (error) { return failure(error); }
}
