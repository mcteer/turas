import { defineDynamic, defineInstructions } from "eve/instructions";
import { staffingContextInstruction } from "../../lib/staffing/advice-context";
import { readStaffingInitialContext } from "../../lib/server/staffing/native-context";
import { responseFeature } from "../../lib/server/conversations/feature";

export default defineDynamic(async (ctx) => {
    const principal = ctx.session.auth.current;
    if ((await responseFeature(principal))?.kind !== "staffing") return null;
  const turnId = ctx.turn?.id;
  if (!turnId) throw new Error("Staffing context is unavailable");
  const snapshot = await readStaffingInitialContext(principal, turnId, ctx.session.id);
    return defineInstructions({ role: "user", content: staffingContextInstruction(snapshot) });
  });
