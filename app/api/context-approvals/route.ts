import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { listWorkspaceReview } from "../../../lib/server/profiles/workspace-review";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    return success(await listWorkspaceReview(actor,
      Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) { return failure(error); }
}
