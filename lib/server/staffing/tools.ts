import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { staffingCapacityToolSchema, staffingCapacityToolResultSchema, staffingDemandToolResultSchema,
  staffingEmptyToolSchema, staffingMatchToolSchema, staffingMatchToolResultSchema, staffingScenarioToolResultSchema } from "../../contracts/staffing-tools";
import { availabilityFreshness } from "../../staffing/freshness";
import { STAFFING_CAPACITY_VERSION } from "../../staffing/calendar";
import { STAFFING_MATCHING_VERSION } from "../../staffing/matching";
import { getServerConfig } from "../config";
import { withTransaction } from "../db/client";
import { boundStaffingToolActor } from "./tool-actor";
import { resolveStaffingAdvisoryFence, staffingToolDependencies, staffingScenarioToolDependencies, staffingModelCitations,
  type StaffingFenceView, type StaffingFenceOptions } from "./fences";
import { reserveStaffingDomainRead, storeStaffingDomainRead, type StaffingReadTool } from "./read-budget";
import { readStaffingPageCursor, staffingPageCursor } from "./read";
import { parseStaffing } from "./commands";
import { prepareStaffingNativeFence } from "./native-context";

type Principal = Parameters<typeof boundStaffingToolActor>[1];
const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");
const outputSchemas = { read_staffing_demand: staffingDemandToolResultSchema,
  match_staffing_resources: staffingMatchToolResultSchema, read_staffing_capacity: staffingCapacityToolResultSchema,
  read_staffing_scenario: staffingScenarioToolResultSchema };

async function requireMatchedResources(db: PoolClient, attemptId: string, resourceIds: readonly string[]) {
  // Only exact resources previously released by this attempt's governed match
  // may be requested. The complete dependency fence subsequently validates all
  // consumed pages before any capacity result is released.
  const payloads = (await db.query(`SELECT p.result FROM staffing_advisory_read_receipts r
    JOIN staffing_advisory_read_payloads p ON p.receipt_id=r.id
    WHERE r.attempt_id=$1 AND r.tool_name='match_staffing_resources' ORDER BY r.ordinal`, [attemptId])).rows;
  const matched = new Set(payloads.flatMap(row => staffingMatchToolResultSchema.parse(row.result).items.map(item => item.resourceId)));
  if (resourceIds.some(id => !matched.has(id))) throw new HttpFailure(403, "staffing_tool_denied", "Request resources from the bound matching result");
}

/** The native call id is the durable read key. Admission commits before a new
 * domain read; a receipt without a payload stays uncertain and is never retried.
 * Both admission/replay and final storage fence the entire consumed union.
 * Temporal package loading and endpoint resolution happen outside SQL locks. */
export async function executeStaffingRead(principal: Principal, requestKey: string, tool: StaffingReadTool, raw: unknown) {
  const input = tool === "match_staffing_resources" ? parseStaffing(staffingMatchToolSchema, raw)
    : tool === "read_staffing_capacity" ? parseStaffing(staffingCapacityToolSchema, raw) : parseStaffing(staffingEmptyToolSchema, raw);
  const prepared = await prepareStaffingNativeFence(principal), { preparedOverlap } = prepared;
  const admission = await withTransaction(async db => {
    const bound = await boundStaffingToolActor(db, principal, async (client, attemptId, context) => {
      await resolveStaffingAdvisoryFence(client, attemptId, context, { preparedOverlap });
    });
    if (bound.attemptId !== prepared.attemptId) throw changed();
    return reserveStaffingDomainRead(db, bound, { requestKey, tool, request: input });
  });
  if (admission.state === "unconfirmed") throw new HttpFailure(409, "staffing_read_unconfirmed", "Staffing read outcome is unconfirmed; no read was retried");
  if (admission.state === "replayed") return outputSchemas[tool].parse(admission.result);
  return withTransaction(async db => {
    let resolved: StaffingFenceView | undefined;
    const capacity = tool === "read_staffing_capacity" ? staffingCapacityToolSchema.parse(input) : null;
    const options: StaffingFenceOptions = { preparedOverlap, matching: tool === "match_staffing_resources",
      resourceIds: capacity?.resourceIds };
    const bound = await boundStaffingToolActor(db, principal, async (client, attemptId, context) => {
      if (attemptId !== prepared.attemptId) throw changed();
      if (capacity) {
        if (!context.demand.demand || capacity.fromDate < context.demand.demand.fromDate || capacity.toDate > context.demand.demand.toDate) {
          throw new HttpFailure(422, "invalid_input", "Capacity period must be within the bound demand");
        }
        await requireMatchedResources(client, attemptId, capacity.resourceIds);
      }
      resolved = await resolveStaffingAdvisoryFence(client, attemptId, context, options);
    });
    if (!resolved) throw changed();
    const view: StaffingFenceView = resolved;
    const common = { contractVersion: "staffing-advice-v1" as const, demandId: bound.scope.demandId,
      demandRevisionId: bound.demand.revisionId, asOf: view.context.deliveryContext.asOf };
    let dependencies = staffingToolDependencies(view), result: unknown;
    if (tool === "read_staffing_demand") {
      result = { ...common, demand: bound.demand.demand, citations: staffingModelCitations(view, dependencies), reviewRequired: false, planningOnly: true };
    } else if (tool === "match_staffing_resources") {
      const page = staffingMatchToolSchema.parse(input), match = view.matching;
      if (!match || !match.demand.demand) throw changed();
      const scope = { environment: getServerConfig().TURAS_ENVIRONMENT_ID, workspace: bound.actor.workspaceId,
        actor: bound.actor.membershipId, session: bound.actor.sessionId, attempt: bound.attemptId,
        projection: "staffing-advice-match", demand: bound.scope.demandId, digest: match.inputDigest };
      const after = readStaffingPageCursor(page.cursor, scope), start = after ? match.matches.findIndex(item => item.resourceId === after) + 1 : 0;
      if (after && !start) throw new HttpFailure(422, "invalid_input", "Invalid staffing comparison cursor");
      const selected = match.matches.slice(start, start + page.pageSize);
      dependencies = staffingToolDependencies(view, selected.map(item => item.resourceId), admission.receiptId);
      result = { ...common, asOf: match.asOf, resultId: admission.receiptId, inputDigest: match.inputDigest,
        formulaVersion: STAFFING_MATCHING_VERSION, fromDate: match.demand.demand.fromDate, toDate: match.demand.demand.toDate,
        skills: match.skillNames, items: selected.map(item => {
          const profile = match.profiles.find(row => row.id === item.resourceId); if (!profile) throw changed();
          return { ...item, displayName: profile.display_name, timezone: profile.timezone };
        }), totalResources: match.matches.length, completePool: true,
        nextCursor: start + selected.length < match.matches.length ? staffingPageCursor(selected.at(-1)!.resourceId, scope) : null,
        citations: staffingModelCitations(view, dependencies), planningOnly: true };
    } else if (capacity) {
      dependencies = staffingToolDependencies(view, capacity.resourceIds);
      result = { ...common, formulaVersion: STAFFING_CAPACITY_VERSION, fromDate: capacity.fromDate, toDate: capacity.toDate,
        items: capacity.resourceIds.map(resourceId => {
          const resource = view.resources.find(row => row.id === resourceId), match = view.matching;
          // A prior match consumes this resource; current whole-pool replay
          // supplies its current profile without an additional post-mutex read.
          const timezone = match?.profiles.find(row => row.id === resourceId)?.timezone;
          if (!resource || !timezone) throw changed();
          return { resourceId, days: view.calendars.get(resourceId)!.filter(day => day.date >= capacity.fromDate && day.date <= capacity.toDate).map(day => {
            const freshness = availabilityFreshness({ observedAt: day.observedAt, nextReviewAt: day.nextReviewAt }, common.asOf);
            const certified = !!day.revisionId && day.timezone === timezone;
            return { date: day.date, calendarRevisionId: day.revisionId, capacityGeneration: day.capacityGeneration ?? 1,
              contractedMinutes: certified ? day.contractedMinutes : null, availableMinutes: certified ? day.availableMinutes : null,
              protectedMinutes: certified ? day.protectedMinutes : null, confirmedMinutes: day.confirmedMinutes,
              remainingMinutes: certified ? day.remainingMinutes : null, freshness: freshness.freshness,
              reviewRequired: !resource.active || !certified || !freshness.validThrough || (day.remainingMinutes !== null && day.remainingMinutes < 0),
              actualUtilization: null, actualReason: "actual_unavailable" as const };
          }) };
        }), citations: staffingModelCitations(view, dependencies), planningOnly: true };
    } else {
      if (bound.scope.mode !== "finance" || !bound.scope.scenarioId || !view.scenario?.content) throw changed();
      dependencies = staffingScenarioToolDependencies(view);
      const { rationale: _rationale, ...scenario } = view.scenario.content;
      result = { ...common, scenarioId: bound.scope.scenarioId, contentDigest: view.scenario.contentDigest, scenario, citations: staffingModelCitations(view, dependencies) };
    }
    const parsed = outputSchemas[tool].parse(result);
    return storeStaffingDomainRead(db, bound, { receiptId: admission.receiptId, requestKey, tool, request: input, result: parsed, dependencies });
  });
}
