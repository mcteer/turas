import { describe, expect, it, vi } from "vitest";
import type { DynamicResolveContext } from "eve/tools";

const scope = vi.hoisted(() => vi.fn());
vi.mock("../../lib/server/staffing/native-context", () => ({ staffingResponseScope: scope,
  prepareStaffingNativeFence: vi.fn(), readStaffingInitialContext: vi.fn() }));

import customerContext from "../../agent/tools/customer_context";
import artifactContext from "../../agent/tools/artifact_context";
import readPlan from "../../agent/tools/read_delivery_plan";
import savePlan from "../../agent/tools/save_delivery_plan_draft";
import evidence from "../../agent/tools/search_evidence";
import research from "../../agent/tools/read_research";
import proposeContext from "../../agent/tools/propose_customer_context";
import proposeClaim from "../../agent/tools/propose_artifact_claim";
import proposeResearch from "../../agent/tools/propose_research";
import demand from "../../agent/tools/read_staffing_demand";
import matches from "../../agent/tools/match_staffing_resources";
import capacity from "../../agent/tools/read_staffing_capacity";
import scenario from "../../agent/tools/read_staffing_scenario";
import staffingSkill from "../../agent/skills/staffing-advice";
import planningSkill from "../../agent/skills/delivery-planning";
import loader from "../../agent/tools/load_skill";

const context = { session: { id: "synthetic-catalog-session", auth: { current: null } },
  channel: {}, messages: [], model: null } as unknown as DynamicResolveContext;
const generic = [customerContext, artifactContext, readPlan, savePlan, evidence, research, proposeContext, proposeClaim, proposeResearch];

describe("staffing model capability selection", () => {
  it("omits generic reads/writes and planning skills for a staffing turn, without executing a tool", async () => {
    scope.mockResolvedValue({ mode: "operational", scenarioId: null });
    for (const tool of generic) expect(await tool.events["turn.started"]!({}, context)).toBeNull();
    for (const tool of [demand, matches, capacity]) {
      const selected = await tool.events["turn.started"]!({}, context);
      expect(selected).not.toBeNull(); expect(selected?.availableInSubagents).toBe(false);
    }
    expect(await scenario.events["turn.started"]!({}, context)).toBeNull();
    expect(await planningSkill.events["turn.started"]!({}, context)).toBeNull();
    const skill = await staffingSkill.events["turn.started"]!({}, context);
    expect(skill?.markdown).toContain("No mutation"); expect(skill).not.toHaveProperty("files");
  });
  it("exposes a scenario only for finance mode with a fixed scenario and restores ordinary tools outside staffing", async () => {
    scope.mockResolvedValue({ mode: "finance", scenarioId: null });
    expect(await scenario.events["turn.started"]!({}, context)).toBeNull();
    scope.mockResolvedValue({ mode: "finance", scenarioId: "synthetic-bound-scenario" });
    expect(await scenario.events["turn.started"]!({}, context)).not.toBeNull();
    scope.mockResolvedValue(null);
    for (const tool of generic) expect(await tool.events["turn.started"]!({}, context)).not.toBeNull();
    for (const tool of [demand, matches, capacity, scenario]) expect(await tool.events["turn.started"]!({}, context)).toBeNull();
    expect(await staffingSkill.events["turn.started"]!({}, context)).toBeNull();
    expect(await planningSkill.events["turn.started"]!({}, context)).not.toBeNull();
  });
  it("denies direct attempts to load another procedure before invoking a loader", async () => {
    scope.mockResolvedValue({ mode: "operational", scenarioId: null });
    await expect(loader.execute({ skill: "delivery-planning" }, { session: context.session } as never))
      .rejects.toMatchObject({ status: 403, code: "staffing_tool_denied" });
  });
});
