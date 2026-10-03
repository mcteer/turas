import { HttpFailure } from "../../contracts/http";
import { responseFeature, type FeaturePrincipal } from "../conversations/feature";

/** Shared procedure gate runs before any framework load or authored text read. */
export async function authorizeStaffingSkill(principal: FeaturePrincipal, skill: string) {
  const feature = await responseFeature(principal);
  if (feature?.kind === "execution") throw new HttpFailure(403, "execution_tool_denied", "Only the execution procedure is available");
  const scope = feature?.kind === "staffing";
  if (scope && skill !== "staffing-advice") throw new HttpFailure(403, "staffing_tool_denied", "Only the staffing procedure is available");
  return Boolean(scope);
}
