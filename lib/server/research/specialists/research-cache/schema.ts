import { createHash } from "node:crypto";
import { z } from "zod";
import { accountIdSchema } from "../account-id";
import { publicResearchUrl } from "../solution-research/evidence";

export const cachePolicy = {
  version: "evidence-v1",
  recheckMs: 6 * 60 * 60 * 1000,
  emptySearchMs: 15 * 60 * 1000,
  failureMs: 60 * 1000,
  briefRetentionDays: 30,
  sourceRetentionDays: 90,
};
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export function canonicalSourceUrl(value: string) {
  if (!publicResearchUrl(value)) throw new Error("Only public HTTPS evidence URLs are supported.");
  const url = new URL(value);
  url.hash = "";
  return url.href;
}
export const requestScopeSchema = z.object({
  accountId: accountIdSchema,
  workload: z.string().trim().min(2).max(160),
  kind: z.enum(["customer-update", "best-practices", "solution"]),
  question: z.string().trim().min(5).max(1500),
  proposal: z.string().trim().min(5).max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "solution" && !value.proposal)
    ctx.addIssue({ code: "custom", path: ["proposal"], message: "A solution request requires a proposal." });
});
export type RequestScope = z.infer<typeof requestScopeSchema>;
export const requestTicketSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  lease: z.uuid(),
}).strict();
export type RequestTicket = z.infer<typeof requestTicketSchema>;
export const snapshotReferenceSchema = z.object({
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  checkedAt: z.iso.datetime(),
  refreshAfter: z.iso.datetime(),
}).strict();
export const reuseSchema = z.object({
  researchedAt: z.iso.datetime(),
  originalResearchId: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export function requestKey(scope: RequestScope, contextHash: string) {
  return digest(JSON.stringify([cachePolicy.version, scope.accountId, normalized(scope.workload), scope.kind,
    normalized(scope.question), normalized(scope.kind === "solution" ? scope.proposal ?? "" : ""), contextHash]));
}
