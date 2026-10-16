import { defineState } from "eve/context";
import { z } from "zod";

export const checklistItem = z.object({
  id: z.string().min(1).max(80),
  text: z.string().trim().min(1).max(500),
  status: z.enum(["pending", "in_progress", "completed"]),
}).strict();
export type Checklist = { revision: number; items: z.infer<typeof checklistItem>[] };
export const taskChecklist = defineState<Checklist>("turas.private-task-checklist.v1", () => ({ revision: 0, items: [] }));

export function replaceChecklist(current: Checklist, expectedRevision: number,
  items: z.infer<typeof checklistItem>[]): Checklist {
  if (current.revision !== expectedRevision) throw new Error("Task checklist changed; read its current revision before replacing it");
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Task IDs must be unique");
  if (items.filter(item => item.status === "in_progress").length > 1) throw new Error("Only one checklist item may be in progress");
  return { revision: current.revision + 1, items };
}
