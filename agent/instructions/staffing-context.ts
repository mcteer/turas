import { defineDynamic, defineInstructions } from "eve/instructions";
import { staffingContextInstruction } from "../../lib/staffing/advice-context";
import { readStaffingInitialContext } from "../../lib/server/staffing/native-context";
import { responseFeature } from "../../lib/server/conversations/feature";

export default defineDynamic({ events: {
  async "turn.started"(event, ctx) {
    const principal = ctx.session.auth.current;
    if ((await responseFeature(principal))?.kind !== "staffing") return null;
    const data = typeof event === "object" && event !== null && "data" in event ? event.data : null;
    if (typeof data !== "object" || data === null || !("turnId" in data) || typeof data.turnId !== "string") {
      throw new Error("Staffing context is unavailable");
    }
    const snapshot = await readStaffingInitialContext(principal, data.turnId, ctx.session.id);
    return defineInstructions({ role: "user", content: staffingContextInstruction(snapshot) });
  },
} });
