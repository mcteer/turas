import { z } from "zod";
import { HttpFailure } from "../contracts/http";
import { staffingDigestSchema, staffingIdSchema, staffingVersionSchema, STAFFING_LIMITS } from "../contracts/staffing";

export const staffingReadDependencySchema = z.object({
  kind: z.enum(["customer", "baseline", "demand", "resource", "skill", "competency", "manual_source", "import_source",
    "calendar", "capacity", "partner_grant", "partner_eligibility", "policy", "scenario", "match", "finance_input"]),
  inputId: staffingIdSchema, revisionId: staffingIdSchema, generation: staffingVersionSchema, contentDigest: staffingDigestSchema,
}).strict();
export type StaffingReadDependency = z.infer<typeof staffingReadDependencySchema>;
const dependenciesSchema = z.array(staffingReadDependencySchema).max(STAFFING_LIMITS.advisoryDependencies);
const identity = (dep: StaffingReadDependency) => `${dep.kind}/${dep.inputId}`;
const same = (a: StaffingReadDependency, b: StaffingReadDependency) => a.revisionId === b.revisionId &&
  a.generation === b.generation && a.contentDigest === b.contentDigest;
const changed = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");

/** Pure identity accounting only. It does not retrieve or authorize sources.
 * Current metadata must come from the authoritative locked domain resolver. */
export function mergeStaffingDependencies(consumed: readonly StaffingReadDependency[], added: readonly StaffingReadDependency[]) {
  const union = new Map<string, StaffingReadDependency>();
  for (const dep of [...dependenciesSchema.parse(consumed), ...dependenciesSchema.parse(added)]) {
    const key = identity(dep), old = union.get(key);
    if (old && !same(old, dep)) throw changed();
    union.set(key, dep);
  }
  if (union.size > STAFFING_LIMITS.advisoryDependencies) {
    throw new HttpFailure(429, "staffing_context_budget", "Staffing explanation context limit reached");
  }
  return [...union.values()].sort((a, b) => identity(a).localeCompare(identity(b)));
}

/** A fence must resolve every consumed identity exactly once. Missing/duplicate
 * rows, replacement heads, changed generations and changed eligibility digests
 * all deny release; an incomplete current prefix cannot validate a saved union. */
export function assertStaffingDependencySnapshot(consumed: readonly StaffingReadDependency[], current: readonly StaffingReadDependency[]) {
  const prior = dependenciesSchema.parse(consumed), resolved = dependenciesSchema.parse(current);
  if (prior.length !== resolved.length) throw changed();
  const expected = new Map(prior.map(dep => [identity(dep), dep]));
  const now = new Map(resolved.map(dep => [identity(dep), dep]));
  if (expected.size !== prior.length || now.size !== resolved.length) throw changed();
  for (const [key, dep] of expected) {
    const found = now.get(key);
    if (!found || !same(dep, found)) throw changed();
  }
}
