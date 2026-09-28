import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ZodError } from "zod";
import { HttpFailure } from "../../contracts/http";
import { profileCommandSchema, type ProfileCommand } from "../../contracts/profiles";
import type { ProfileActor } from "./policy";
import { lockProfileActor } from "./policy";
import { priorProfileReceipt, finishProfileReceipt } from "./commands";
import { addProposal } from "./repository";
import { reviewRevision } from "./review";
import { handleRetraction } from "./retractions";
import { changeSteward } from "./stewards";
import { proposeWorkload } from "./identity";
import { handleConflict } from "./conflicts";
import { withTransaction } from "../db/client";
import { enforceProfileRate } from "./rate";
import { appendProfileAudit } from "./audit";

export async function submitProfileCommandDetailed(actor: ProfileActor, customerId: string,
  input: unknown, existingClient?: PoolClient,
  options: { submissionChannel?: "agent_proposal" | "artifact_share";
    artifactSelectionId?: string } = {}):
  Promise<{ data: unknown; replayed: boolean; status: number }> {
  let command: ProfileCommand;
  try { command = profileCommandSchema.parse(input); }
  catch (error) {
    if (error instanceof ZodError) throw new HttpFailure(422, "invalid_command", "Invalid profile command");
    throw error;
  }
  const execute = async (client: PoolClient): Promise<{ data: unknown; replayed: boolean; status: number }> => {
    const started = Date.now();
    const affectedMember = command.action === "assign_steward" || command.action === "revoke_steward"
      ? command.membershipId : undefined;
    await lockProfileActor(client, actor, customerId, affectedMember);
    await enforceProfileRate(client, actor, customerId, "write");
    const prior = await priorProfileReceipt(client, actor, customerId, command);
    if (prior !== null) return { data: prior, replayed: true, status: 200 };
    const receiptId = randomUUID();
    let result: unknown;
    switch (command.action) {
      case "propose_record":
      case "propose_revision":
        result = await addProposal(client, actor, customerId, command,
          options.submissionChannel ?? "profile_form", options.artifactSelectionId);
        break;
      case "propose_workload":
        result = await proposeWorkload(client, actor, customerId, command);
        break;
      case "accept_revision":
      case "reject_revision":
        result = await reviewRevision(client, actor, customerId, command, receiptId);
        break;
      case "request_retraction":
      case "retract_revision":
      case "decline_retraction":
      case "withdraw_source":
        result = await handleRetraction(client, actor, customerId, command, receiptId);
        break;
      case "assign_steward":
      case "revoke_steward":
        result = await changeSteward(client, actor, customerId, command);
        break;
      case "flag_conflict":
      case "confirm_conflict":
      case "resolve_conflict":
        result = await handleConflict(client, actor, customerId, command);
        break;
      default:
        throw new HttpFailure(422, "unsupported_action", "Action is not available");
    }
    const status = ["propose_record", "propose_revision", "propose_workload", "request_retraction"].includes(command.action) ? 201 : 200;
    await appendProfileAudit(client, actor, customerId, command, result, receiptId,
      Date.now() - started);
    await finishProfileReceipt(client, actor, customerId, command, result, status, receiptId);
    return { data: result, replayed: false, status };
  };
  return existingClient ? execute(existingClient) : withTransaction(execute);
}


export async function submitProfileCommand(actor: ProfileActor, customerId: string,
  input: unknown, existingClient?: PoolClient): Promise<unknown> {
  return (await submitProfileCommandDetailed(actor, customerId, input, existingClient)).data;
}
