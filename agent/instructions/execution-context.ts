import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { readExecutionInitialContext } from "../../lib/server/execution/initial-context";
import { executionContextInstruction } from "../../lib/execution/advice-context";
export default defineDynamic({ events: {
  async "turn.started"(event, ctx) {
    if ((await responseFeature(ctx.session.auth.current))?.kind !== "execution") return null;
    const data = typeof event === "object" && event !== null && "data" in event ? event.data : null;
    if (!data || typeof data !== "object" || !("turnId" in data) || typeof data.turnId !== "string") throw new Error("Execution context is unavailable");
    const snapshot = await readExecutionInitialContext(ctx.session.auth.current, data.turnId, ctx.session.id);
    return defineInstructions({ role: "user", content: executionContextInstruction(snapshot) });
  },
} });
