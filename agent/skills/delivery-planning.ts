import { defineDynamic, defineSkill } from "eve/skills";
import { planningSkillMarkdown } from "../../lib/staffing/skill-text";
import { staffingResponseScope } from "../../lib/server/staffing/native-context";

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    if (await staffingResponseScope(ctx.session.auth.current)) return null;
    return defineSkill({ description: "Use when preparing or revising a governed delivery plan for a selected Turas customer and workload.",
      markdown: planningSkillMarkdown });
  },
} });
