import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { readSupportInitialContext } from "../../lib/server/support/native";
import { supportAdviceInstructions } from "../../lib/support/advice";
export default defineDynamic(async (ctx) => {
  if ((await responseFeature(ctx.session.auth.current))?.kind !== "support") return null;
  const turnId = ctx.turn?.id;
  if (!turnId) throw new Error("Support context is unavailable");
  const snapshot = await readSupportInitialContext(ctx.session.auth.current, turnId, ctx.session.id);
  return defineInstructions({ role: "user", content: supportAdviceInstructions(snapshot) });
});
