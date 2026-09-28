import { defineHook } from "eve/hooks";
import { withTransaction } from "../../lib/server/db/client";
import { readCurrentAttemptContext } from "../../lib/server/profiles/attempt-context";
import { readCurrentArtifactDraft } from "../../lib/server/artifacts/context";

export default defineHook({
  events: {
    async "step.started"(event, ctx) {
      const principal = ctx.session.auth.current;
      const attemptId = principal?.attributes?.turasAttemptId;
      if (typeof attemptId !== "string" || !principal?.principalId) {
        throw new Error("Customer context was not bound to this turn");
      }
      await withTransaction(async (client) => {
        await readCurrentAttemptContext(client, attemptId, principal.principalId);
        const receipt = await client.query(`SELECT 1 FROM context_injection_receipts i
          JOIN context_snapshot_receipts s ON s.attempt_id=i.attempt_id
          WHERE i.attempt_id=$1 AND i.turn_id=$2 AND i.snapshot_digest=s.snapshot_digest`,
        [attemptId, event.data.turnId]);
        if (!receipt.rowCount) throw new Error("Customer context was not injected");
        const draft = await readCurrentArtifactDraft(client,attemptId,principal.principalId);
        if (draft) {
          const injected = await client.query(`SELECT 1 FROM artifact_context_injection_receipts
            WHERE attempt_id=$1 AND turn_id=$2 AND injection_digest=$3`,
          [attemptId,event.data.turnId,draft.digest]);
          if (!injected.rowCount) throw new Error("Artifact context was not injected");
        }
      });
    },
  },
});
