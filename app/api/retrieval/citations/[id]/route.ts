import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../lib/server/auth/sessions";
import { withTransaction } from "../../../../../lib/server/db/client";
import { resolveRetrievalCitation } from "../../../../../lib/server/retrieval/citations";

export const dynamic = "force-dynamic";

export async function GET(request: Request,
  context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401,"authentication_required","Sign in required");
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new HttpFailure(422,"invalid_input","Invalid citation");
    return success(await withTransaction((client) => resolveRetrievalCitation(client,actor,id)));
  } catch (error) { return failure(error); }
}
