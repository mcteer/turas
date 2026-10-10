import { gateway } from "ai";
import { defineAgent, defineDynamic } from "eve";
import { withTransaction } from "../lib/server/db/client";
import { hiddenRecord } from "../lib/contracts/http";
import { boundToolActor } from "../lib/server/profiles/tool-actor";
import { admitPlanModelStep, wrapPlanModel } from "../lib/server/plans/model-budget";
import { rejectUnbridgedStaffingNative } from "../lib/server/staffing/context";
import { getServerConfig } from "../lib/server/config";
import { staffingResponseScope } from "../lib/server/staffing/native-context";
import { admitGovernedStaffingModelStep, assertGovernedStaffingProviderRelease } from "../lib/server/staffing/native-admission";
import { wrapStaffingModel } from "../lib/server/staffing/model-budget";

const selectedModel = "spacexai/grok-4.7";

export default defineAgent({
  // Turas owns durable, authorized captures. Retiring a native session must
  // also remove eve's model/tool payloads and replay log.
  experimental: { workflow: { retention: 0 } },
  model: defineDynamic({ events: {
    "session.started": () => selectedModel,
    async "step.started"(event, ctx) {
      const data = typeof event === "object" && event !== null && "data" in event ?
        event.data : null;
      if (typeof data !== "object" || data === null ||
          !("turnId" in data) || typeof data.turnId !== "string" ||
          !("stepIndex" in data) || typeof data.stepIndex !== "number") {
        throw hiddenRecord();
      }
      const turnId = data.turnId;
      const stepIndex = data.stepIndex;
      const principal = ctx.session.auth.current;
      if (await staffingResponseScope(principal)) {
        const responseAttemptId = principal?.attributes?.turasAttemptId;
        if (!principal?.principalId || typeof responseAttemptId !== "string") throw hiddenRecord();
        const identity = { nativeSessionId: ctx.session.id, responseAttemptId, turnId, stepIndex };
        const admitted = await admitGovernedStaffingModelStep(principal, identity);
        return wrapStaffingModel(gateway(selectedModel), admitted.mode, {
          deadlineAt: admitted.deadlineAt, beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),
        });
      }
      return withTransaction(async (client) => {
        const marker = await client.query<{schema_version:number}>(
          "SELECT schema_version FROM turas_environment LIMIT 1");
        if ((marker.rows[0]?.schema_version ?? 0) < 31) return selectedModel;
        if ((marker.rows[0]?.schema_version ?? 0) >= 34) {
          const conversation = (await client.query<{ id: string }>(`SELECT id FROM conversations
            WHERE eve_session_id=$1 AND environment_id=$2`, [ctx.session.id, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
          if (conversation) await rejectUnbridgedStaffingNative(client, conversation.id);
        }
        const binding = await client.query(`SELECT 1 FROM conversations conversation
          JOIN planning_conversation_bindings plan
            ON plan.conversation_id=conversation.id
          WHERE conversation.eve_session_id=$1 LIMIT 1`, [ctx.session.id]);
        if (!binding.rowCount) return selectedModel;
        const principal = ctx.session.auth.current;
        const responseAttemptId = principal?.attributes?.turasAttemptId;
        if (!principal?.principalId || typeof responseAttemptId !== "string") {
          throw hiddenRecord();
        }
        const bound = await boundToolActor(client, principal);
        if (!bound.planning) throw hiddenRecord();
        await admitPlanModelStep(client, bound.actor, {
          nativeSessionId: ctx.session.id, responseAttemptId,
          turnId, stepIndex,
        });
        return wrapPlanModel(gateway(selectedModel));
      });
    },
  } }),
  reasoning: "low",
});
