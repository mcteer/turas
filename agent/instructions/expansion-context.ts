import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { readExpansionInitialContext } from "../../lib/server/expansion/native";
import { expansionAdviceInstructions } from "../../lib/expansion/advice";
export default defineDynamic(async (ctx) => {
  if ((await responseFeature(ctx.session.auth.current))?.kind !== "expansion") return null;
  const turnId = ctx.turn?.id;
  if (!turnId) throw new Error("Expansion context is unavailable");
  const snapshot = await readExpansionInitialContext(ctx.session.auth.current, turnId, ctx.session.id);
  return defineInstructions({ role: "user", content: expansionAdviceInstructions(snapshot) });
});
