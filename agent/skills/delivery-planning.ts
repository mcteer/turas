import { defineDynamic, defineSkill } from "eve/skills";
import { planningSkillMarkdown } from "../../lib/staffing/skill-text";
import { responseFeature } from "../../lib/server/conversations/feature";

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    const feature = await responseFeature(ctx.session.auth.current);
    if (feature?.kind === "staffing" || feature?.kind === "execution" || feature?.kind === "support") return null;
    return defineSkill({ description: "Use when preparing or revising a governed delivery plan for a selected Turas customer and workload.",
      markdown: planningSkillMarkdown });
  },
} });
