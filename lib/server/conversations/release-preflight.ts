/** Hidden support deltas carry no released content. Final messages always need
 * current-source preparation; metadata settlement does not retrieve prose. */
export function needsGovernedReleasePreflight(kind: string | null, type: string) {
  if (!kind || !["staffing", "execution", "support", "expansion"].includes(kind)) return false;
  if (["step.completed", "step.failed", "turn.completed", "turn.failed", "turn.cancelled"].includes(type)) return false;
  return !(["support","expansion"].includes(kind) && type === "message.appended");
}
