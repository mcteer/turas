import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { readExpansionInitialContext } from "../../lib/server/expansion/native";
import { expansionAdviceInstructions } from "../../lib/expansion/advice";
export default defineDynamic({ events: { async "turn.started"(event, ctx) {
  if ((await responseFeature(ctx.session.auth.current))?.kind !== "expansion") return null;
  const data = typeof event === "object" && event !== null && "data" in event ? event.data : null;
  if (!data || typeof data !== "object" || !("turnId" in data) || typeof data.turnId !== "string") throw new Error("Expansion context unavailable");
  const snapshot = await readExpansionInitialContext(ctx.session.auth.current, data.turnId, ctx.session.id);
  return defineInstructions({ role: "user", content: expansionAdviceInstructions(snapshot) });
} } });
