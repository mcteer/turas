import { defineDynamic, defineSkill } from "eve/skills";
import { staffingSkillMarkdown } from "../../lib/staffing/skill-text";
import { responseFeature } from "../../lib/server/conversations/feature";

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    if ((await responseFeature(ctx.session.auth.current))?.kind !== "staffing") return null;
    return defineSkill({ description: "Explain the bound staffing request using current governed read tools, exact domain calculations and human decision rights.",
      markdown: staffingSkillMarkdown });
  },
} });
