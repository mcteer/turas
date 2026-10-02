import { randomUUID } from "node:crypto";
import { query } from "../../../lib/server/db/client";
import { requireOwnedStaffingClone } from "../../../scripts/staffing-eval-environment";
import { HttpFailure } from "../../../lib/contracts/http";
import { authoredTool as savePlan } from "../../../agent/tools/save_delivery_plan_draft";
import { authoredTool as research } from "../../../agent/tools/propose_research";
import { authoredTool as customerContext } from "../../../agent/tools/customer_context";
import { authorizeStaffingSkill } from "../../../lib/server/staffing/skill-scope";
import { executeStaffingRead } from "../../../lib/server/staffing/tools";
import { PLAN_FIXTURE_SCOPE } from "../plans/seed";

/** Actual guarded callbacks, with the response's real owner association. This
 * does not emulate a model tool request or claim an unregistered sandbox tool
 * ran. File/research procedure loads are denied before the framework loader. */
export async function probeStaffingLiveDeniedTools(attemptId: string) {
  requireOwnedStaffingClone();
  const owner = (await query(`SELECT a.response_attempt_id,c.owner_principal_id FROM staffing_advisory_attempts a
    JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1 AND a.environment_id=$2`,
  [attemptId, process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if (!owner?.response_attempt_id) throw new Error("Live denial requires an actual owned response");
  const principal = { principalId: owner.owner_principal_id, attributes: { turasAttemptId: owner.response_attempt_id } };
  const ctx = { session: { auth: { current: principal } }, callId: randomUUID() } as never;
  const probes = [
    { name: "delivery-plan-mutation", status: 403, run: () => savePlan.execute({} as never, ctx) },
    { name: "research-preview", status: 403, run: () => research.execute({ mode: "practices", product: "Synthetic", version: "1", topic: "Synthetic" }, ctx) },
    { name: "generic-customer-context", status: 403, run: () => customerContext.execute({ page: 1, limit: 1 }, ctx) },
    { name: "research-procedure", status: 403, run: () => authorizeStaffingSkill(principal, "research") },
    { name: "file-sandbox-procedure", status: 403, run: () => authorizeStaffingSkill(principal, "sandbox") },
    { name: "caller-changed-customer", status: 422, run: () => executeStaffingRead(principal, randomUUID(), "read_staffing_demand",
      { customerId: PLAN_FIXTURE_SCOPE.deniedCustomerId }) },
  ];
  const results: { name: string; status: number; code: string }[] = [];
  for (const probe of probes) {
    try { await probe.run(); throw new Error("Live forbidden callback unexpectedly succeeded"); }
    catch (error) {
      if (!(error instanceof HttpFailure) || error.status !== probe.status) throw new Error("Live forbidden callback did not establish its denial");
      results.push({ name: probe.name, status: error.status, code: error.code });
    }
  }
  return results;
}
