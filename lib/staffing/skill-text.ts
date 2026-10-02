import staffingSource from "../../agent/skill-procedures/staffing-advice/SKILL.md?raw";
import planningSource from "../../agent/skill-procedures/delivery-planning/SKILL.md?raw";

// The authored procedures remain files; these deterministic module values are
// shared by dynamic skill advertisement and exact loader byte accounting.
export const staffingSkillMarkdown = staffingSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
export const planningSkillMarkdown = planningSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
