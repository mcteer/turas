import { expect, it } from "vitest";
import { needsGovernedReleasePreflight } from "../../lib/server/conversations/release-preflight";

it("does not rebuild source closure for hidden support deltas but fences all released final content", () => {
  expect(needsGovernedReleasePreflight("support", "message.appended")).toBe(false);
  for (const kind of ["support", "staffing", "execution"]) {
    expect(needsGovernedReleasePreflight(kind, "message.completed")).toBe(true);
    expect(needsGovernedReleasePreflight(kind, "message.received")).toBe(true);
    expect(needsGovernedReleasePreflight(kind, "step.completed")).toBe(false);
  }
  expect(needsGovernedReleasePreflight("staffing", "message.appended")).toBe(true);
  expect(needsGovernedReleasePreflight("execution", "message.appended")).toBe(true);
  expect(needsGovernedReleasePreflight("normal", "message.appended")).toBe(false);
  expect(needsGovernedReleasePreflight(null, "message.completed")).toBe(false);
});
