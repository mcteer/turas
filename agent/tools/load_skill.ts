import { responseFeature } from "../../lib/server/conversations/feature";
import { runExecutionRead } from "../../lib/server/execution/tools";
import { runSupportRead } from "../../lib/server/support/tools";
import { defineTool } from "eve/tools";
import { loadSkill } from "eve/tools/load_skill";
import { z } from "zod";
import { authorizeStaffingSkill } from "../../lib/server/staffing/skill-scope";
import { loadStaffingSkill } from "../../lib/server/staffing/skill-load";

export default defineTool({ ...loadSkill,
  inputSchema: z.object({ skill: z.string().min(1).max(120) }).strict(),
  outputSchema: z.string(),
  availableInSubagents: false,
  async execute(input, ctx) {
    if ((await responseFeature(ctx.session.auth.current))?.kind === "support")
      return z.string().parse(await runSupportRead(ctx.session.auth.current, "load_skill", { name: input.skill }, ctx.callId));
    if ((await responseFeature(ctx.session.auth.current))?.kind === "execution")
      return z.string().parse(await runExecutionRead(ctx.session.auth.current, "load_skill", input, ctx.callId));
    if (await authorizeStaffingSkill(ctx.session.auth.current, input.skill)) {
      return loadStaffingSkill(ctx.session.auth.current, ctx.callId);
    }
    return z.string().parse(await loadSkill.execute(input, ctx));
  },
});
