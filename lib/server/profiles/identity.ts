import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import type { ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import { addProposal } from "./repository";

type WorkloadCommand = Extract<ProfileCommand, { action: "propose_workload" }>;
export async function proposeWorkload(client: PoolClient, actor: ProfileActor, customerId: string,
  command: WorkloadCommand): Promise<{ workloadId: string; recordId: string; revisionId: string; reviewState: "pending" }> {
  if (actor.kind !== "internal" || command.payload.kind !== "workload_details") {
    throw new HttpFailure(403, "forbidden", "Action not allowed");
  }
  const workloadId = randomUUID();
  await client.query(`INSERT INTO customer_workloads(id,workspace_id,customer_id,display_name)
    VALUES ($1,$2,$3,'Pending workload')`,
  [workloadId, actor.workspaceId, customerId]);
  const proposal = await addProposal(client, actor, customerId, {
    action: "propose_record", requestKey: command.requestKey, workloadId,
    payload: command.payload, qualityInput: command.qualityInput,
    requestedAudience: "internal", dataCategory: "other_internal",
    evidenceRevisionIds: [],
  });
  return { workloadId, ...proposal };
}
