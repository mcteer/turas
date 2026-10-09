import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";

const schema = z.object({ version: z.literal(1), binding: z.string().regex(/^[a-f0-9]{64}$/),
  generation: z.string().regex(/^[a-f0-9]{64}$/), offset: z.number().int().nonnegative().max(1_000_000),
  expiresAt: z.number().int().positive() }).strict();
const signature = (value: string) => createHmac("sha256", getServerConfig().TURAS_MAINTENANCE_SECRET)
  .update(`expansion-advice-cursor-v1:${value}`).digest();
export function encodeExpansionCursor(binding: string, generation: string, offset: number, now = Date.now()) {
  const payload = schema.parse({ version: 1, binding, generation, offset, expiresAt: now + 300_000 });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}
export function decodeExpansionCursor(raw: string, binding: string, generation: string, now = Date.now()) {
  try {
    const parts = raw.split(".");
    if (parts.length !== 2 || raw.length > 4096) throw new Error("Invalid cursor");
    const supplied = Buffer.from(parts[1]!, "base64url"), expected = signature(parts[0]!);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid signature");
    const value = schema.parse(JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")));
    if (value.binding !== binding || value.generation !== generation || value.expiresAt <= now) throw new Error("Refresh cursor");
    return value.offset;
  } catch { throw new HttpFailure(409, "cursor_changed", "Expansion view changed or expired; refresh the list"); }
}
