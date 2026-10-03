import { defineDynamic, defineSkill } from "eve/skills";
import { responseFeature } from "../../lib/server/conversations/feature";
import { executionSkillMarkdown } from "../../lib/execution/skill-text";
export default defineDynamic({ events: {
  async "turn.started"(_event, ctx) {
    if ((await responseFeature(ctx.session.auth.current))?.kind !== "execution") return null;
    return defineSkill({ description: "Explain reviewed execution with exact effort, evidence, unknowns and human decision rights.", markdown: executionSkillMarkdown });
  },
} });
