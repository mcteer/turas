import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { readSupportInitialContext } from "../../lib/server/support/native";
import { supportAdviceInstructions } from "../../lib/support/advice";
export default defineDynamic({ events: { async "turn.started"(event, ctx) {
  if ((await responseFeature(ctx.session.auth.current))?.kind !== "support") return null;
  const data = typeof event === "object" && event !== null && "data" in event ? event.data : null;
  if (!data || typeof data !== "object" || !("turnId" in data) || typeof data.turnId !== "string") throw new Error("Support context unavailable");
  const snapshot = await readSupportInitialContext(ctx.session.auth.current, data.turnId, ctx.session.id);
  return defineInstructions({ role: "user", content: supportAdviceInstructions(snapshot) });
} } });
