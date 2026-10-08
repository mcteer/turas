import { z } from "zod";

export const createConversationSchema = z.object({
  customerId: z.uuid().nullable().optional(),
  requestKey: z.uuid(),
  title: z.string().trim().min(1).max(120).optional(),
}).strict();

export const listConversationSchema = z.object({
  customerId: z.uuid().optional(),
  title: z.string().max(100).optional(),
  archived: z.enum(["true", "false"]).default("false"),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict();

export type ConversationReference = {
  id: string;
  customerId: string | null;
  ownerPrincipalId: string;
  title: string;
  bindingState: "unbound" | "creating" | "reconciling" | "bound" | "failed";
  eveSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  contextStatus?: "current" | "changed" | "historical";
};

export const archiveConversationSchema = z.object({ archived: z.boolean() }).strict();
