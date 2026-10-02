import { defineDynamic, defineSkill } from "eve/skills";
import { staffingSkillMarkdown } from "../../lib/staffing/skill-text";
import { staffingResponseScope } from "../../lib/server/staffing/native-context";

export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    if (!await staffingResponseScope(ctx.session.auth.current)) return null;
    return defineSkill({ description: "Explain the bound staffing request using current governed read tools, exact domain calculations and human decision rights.",
      markdown: staffingSkillMarkdown });
  },
} });
