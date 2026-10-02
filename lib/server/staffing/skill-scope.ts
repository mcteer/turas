import { HttpFailure } from "../../contracts/http";
import { staffingResponseScope } from "./native-context";

/** Shared procedure gate runs before any framework load or authored text read. */
export async function authorizeStaffingSkill(principal: Parameters<typeof staffingResponseScope>[0], skill: string) {
  const scope = await staffingResponseScope(principal);
  if (scope && skill !== "staffing-advice") throw new HttpFailure(403, "staffing_tool_denied", "Only the staffing procedure is available");
  return Boolean(scope);
}
