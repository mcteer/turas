import { defineHook } from "eve/hooks";
import { withTransaction } from "../../lib/server/db/client";
import { readCurrentAttemptContext } from "../../lib/server/profiles/attempt-context";
import { readCurrentArtifactDraft } from "../../lib/server/artifacts/context";
import { readStaffingInitialContext } from "../../lib/server/staffing/native-context";
import { readExecutionInitialContext } from "../../lib/server/execution/initial-context";
import { responseFeature } from "../../lib/server/conversations/feature";

export default defineHook({
  events: {
    async "step.started"(event, ctx) {
      const principal = ctx.session.auth.current;
      const attemptId = principal?.attributes?.turasAttemptId;
      if (typeof attemptId !== "string" || !principal?.principalId) {
        throw new Error("Customer context was not bound to this turn");
      }
      const feature = await responseFeature(principal);
      if (feature?.kind === "support" || feature?.kind === "expansion") {
        // Hooks observe events; they are not the paid-call authorization boundary.
        // Support admission validates exact injection and current sources, and
        // wrapSupportModel rechecks authority immediately before provider I/O.
        // Repeating that full capture here adds latency without a new boundary.
        return;
      }
      if (feature?.kind === "execution") {
        await readExecutionInitialContext(principal, event.data.turnId, ctx.session.id, false);
        return;
      }
      if (feature?.kind === "staffing") {
        await readStaffingInitialContext(principal, event.data.turnId, ctx.session.id, false);
        return;
      }
      await withTransaction(async (client) => {
        const context = await readCurrentAttemptContext(client, attemptId, principal.principalId);
        if (context.contractVersion === "general-context-v1") {
          const receipt = await client.query(`SELECT 1 FROM general_context_injections i JOIN general_context_receipts r ON r.attempt_id=i.attempt_id
            WHERE i.attempt_id=$1 AND i.turn_id=$2 AND i.snapshot_digest=r.snapshot_digest`,[attemptId,event.data.turnId]);
          if (!receipt.rowCount) throw new Error("General context was not injected");
          return;
        }
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
