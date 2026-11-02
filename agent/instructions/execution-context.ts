import { defineDynamic, defineInstructions } from "eve/instructions";
import { responseFeature } from "../../lib/server/conversations/feature";
import { readExecutionInitialContext } from "../../lib/server/execution/initial-context";
import { executionContextInstruction } from "../../lib/execution/advice-context";
export default defineDynamic(async (ctx) => {
    if ((await responseFeature(ctx.session.auth.current))?.kind !== "execution") return null;
  const turnId = ctx.turn?.id;
  if (!turnId) throw new Error("Execution context is unavailable");
  const snapshot = await readExecutionInitialContext(ctx.session.auth.current, turnId, ctx.session.id);
    return defineInstructions({ role: "user", content: executionContextInstruction(snapshot) });
  });
