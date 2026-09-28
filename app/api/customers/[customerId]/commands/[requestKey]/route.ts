import { z } from "zod";
import { failure, HttpFailure, hiddenRecord, success } from "../../../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../../../lib/server/auth/sessions";
import { withTransaction } from "../../../../../../lib/server/db/client";
import { lockProfileActor } from "../../../../../../lib/server/profiles/policy";
import { enforceProfileRate } from "../../../../../../lib/server/profiles/rate";

export const dynamic = "force-dynamic";
export async function GET(request: Request,
  context: { params: Promise<{ customerId: string; requestKey: string }> }): Promise<Response> {
  try {
    const session = await getCurrentSession(request);
    if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const { customerId, requestKey } = await context.params;
    if (!z.uuid().safeParse(customerId).success || !z.uuid().safeParse(requestKey).success) {
      throw new HttpFailure(422, "invalid_input", "Invalid request");
    }
    const receipt = await withTransaction(async (client) => {
      await lockProfileActor(client, session, customerId);
      await enforceProfileRate(client, session, customerId, "read");
      const result = await client.query<{ action: string; result: unknown; status: number }>(`
        SELECT action,result,status FROM profile_command_receipts
        WHERE workspace_id=$1 AND customer_id=$2 AND actor_membership_id=$3 AND request_key=$4`,
      [session.workspaceId, customerId, session.membershipId, requestKey]);
      if (!result.rows[0]) throw hiddenRecord();
      return result.rows[0];
    });
    return success(receipt);
  } catch (error) { return failure(error); }
}
