import { z } from "zod";
import { failure, HttpFailure, success } from "../../../../lib/contracts/http";
import { getCurrentSession } from "../../../../lib/server/auth/sessions";
import { withTransaction } from "../../../../lib/server/db/client";
import { inventorySignalSchema, readPublicCustomerInventory } from "../../../../lib/server/profiles/public-inventory";

export const dynamic = "force-dynamic";
const querySchema = z.object({ query: z.string().trim().max(160).default(""),
  signal: inventorySignalSchema.optional(), cursor: z.string().max(500).optional() }).strict();
export async function GET(request: Request) {
  try {
    const actor = await getCurrentSession(request);
    if (!actor) throw new HttpFailure(401, "authentication_required", "Sign in required");
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new HttpFailure(422, "invalid_query", "Invalid customer discovery query");
    const input = parsed.data;
    const filter = JSON.stringify([input.query, input.signal ?? ""]);
    let offset = 0;
    if (input.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(input.cursor,"base64url").toString());
        if (cursor.member !== actor.membershipId || cursor.filter !== filter ||
          !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > 1000) throw Error();
        offset = cursor.offset;
      } catch { throw new HttpFailure(422, "invalid_cursor", "Invalid discovery cursor"); }
    }
    const result = await withTransaction(db => readPublicCustomerInventory(db, actor,
      { query: input.query, signal: input.signal, offset, limit: 20 }, { includeSynthetic: true }));
    return success({ items: result.accounts.map(account => ({ id: account.id,
      displayName: account.name, synthetic: account.synthetic })),
      nextCursor: result.nextOffset === null ? null : Buffer.from(JSON.stringify({
        member: actor.membershipId, filter, offset: result.nextOffset,
      })).toString("base64url"), limitations: result.limitations });
  } catch (error) { return failure(error); }
}
