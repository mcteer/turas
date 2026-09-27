import { defineHook } from "eve/hooks";
import { projectNativeEvent } from "../../lib/server/conversations/projection";

export default defineHook({
  events: {
    async "*"(event, ctx) {
      const attemptId = ctx.session.auth.current?.attributes.turasAttemptId;
      if (typeof attemptId !== "string") return;
      await projectNativeEvent(ctx.session.id, attemptId, event);
    },
  },
});
