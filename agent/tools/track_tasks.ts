import {objectToolInput} from "../lib/object-tool-input";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalChatTool } from "../lib/normal-chat-tool";
import { taskChecklist, checklistItem, replaceChecklist } from "../lib/task-checklist";
import { withTransaction } from "../../lib/server/db/client";
import { ordinaryActor } from "../../lib/server/ordinary-operations/reads";

const replaceInput = z.object({ action: z.literal("replace"),
  expectedRevision: z.number().int().nonnegative(), items: z.array(checklistItem).max(50) }).strict();
const checklistInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }).strict(), replaceInput,
]);
// Advertise an object while retaining branch-specific validation before execution.
export const inputSchema = objectToolInput(
  replaceInput.partial().extend({ action: z.enum(["read", "replace"]) }).strict(),checklistInput,
);

export const authoredTool = defineTool({
  description: "Read or replace this private conversation's durable task checklist. Track progress for complex work across turns and reconnects; a completed checklist item does not accept evidence, approve a decision or mark delivery complete.",
  availableInSubagents: false,
  inputSchema,
  async execute(input, ctx) {
    await withTransaction(db => ordinaryActor(db, ctx.session.auth.current));
    if (input.action === "replace") taskChecklist.update(current => replaceChecklist(current, input.expectedRevision, input.items));
    return taskChecklist.get();
  },
});
export default normalChatTool(authoredTool);
