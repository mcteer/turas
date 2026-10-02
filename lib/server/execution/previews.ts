import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerConfig } from "../config";
import { HttpFailure } from "../../contracts/http";
import type { ExecutionActor } from "./policy";
import { executionDigest } from "./commands";

function mac(value: unknown): string {
  return createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET).update(`execution-v1:${executionDigest(value)}`).digest("hex");
}
function scope(actor: ExecutionActor) { return { environment: getServerConfig().TURAS_ENVIRONMENT_ID,
  workspace: actor.workspaceId, member: actor.membershipId, session: actor.sessionId }; }
export function createExecutionPreview(actor: ExecutionActor, inputs: unknown, now = Date.now()) {
  const previewExpiresAt = new Date(now + 300_000).toISOString();
  return { previewDigest: mac({ actor: scope(actor), inputs, previewExpiresAt }), previewExpiresAt };
}
export function assertExecutionPreview(actor: ExecutionActor, inputs: unknown,
  preview: { previewDigest: string; previewExpiresAt: string }, now = Date.now()) {
  const expires = Date.parse(preview.previewExpiresAt);
  if (!Number.isFinite(expires) || expires <= now || expires > now + 300_000 || !/^[a-f0-9]{64}$/.test(preview.previewDigest))
    throw new HttpFailure(409, "stale_version", "Review preview expired or changed");
  const expected = mac({ actor: scope(actor), inputs, previewExpiresAt: preview.previewExpiresAt });
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(preview.previewDigest, "hex")))
    throw new HttpFailure(409, "source_changed", "Review inputs changed");
}
const cursorSchema = z.object({ scope: z.string().regex(/^[a-f0-9]{64}$/), lastAt: z.iso.datetime(),
  lastId: z.uuid(), expires: z.number().int().positive() }).strict();
export function executionCursor(scopeInput: unknown, lastAt: string, lastId: string, now = Date.now()): string {
  const value = cursorSchema.parse({ scope: executionDigest(scopeInput), lastAt, lastId, expires: now + 600_000 });
  const body = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${body}.${mac(body)}`;
}
export function readExecutionCursor(raw: string | undefined, scopeInput: unknown, now = Date.now()) {
  if (!raw) return null;
  try {
    const [body, signature, extra] = raw.split(".");
    if (!body || !signature || extra || raw.length > 4096 || !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(mac(body), "hex"), Buffer.from(signature, "hex"))) throw new Error("Invalid signature");
    const value = cursorSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (value.expires <= now || value.expires > now + 600_000 || value.scope !== executionDigest(scopeInput))
      throw new HttpFailure(409, "source_changed", "List scope changed");
    return value;
  } catch (error) { if (error instanceof HttpFailure) throw error;
    throw new HttpFailure(400, "invalid_input", "Invalid execution cursor"); }
}
