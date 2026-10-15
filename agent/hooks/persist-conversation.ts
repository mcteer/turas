import { defineHook } from "eve/hooks";
import { projectNativeEvent } from "../../lib/server/conversations/projection";

export default defineHook({
  events: {
    async "*"(event, ctx) {
      const attemptId = ctx.session.auth.current?.attributes.turasAttemptId;
      const inputEvent = event.type === "input.requested" || event.type === "input.resolved";
      if (inputEvent) console.info(JSON.stringify({ event: "conversation.native_input_observed",
        type: event.type, hasAttempt: typeof attemptId === "string" }));
      if (typeof attemptId !== "string") return;
      try {
        await projectNativeEvent(ctx.session.id, attemptId, event);
      } catch (error) {
        // Never log event payloads, source passages, principal IDs or provider errors.
        console.warn(JSON.stringify({ event: "conversation.projection_failed", type: event.type,
          name: error instanceof Error ? error.name : "unknown",
          code: typeof error === "object" && error !== null && "code" in error &&
            typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : null,
          frames: error instanceof Error ? error.stack?.split("\n").slice(1, 5)
            .filter(frame => /^\s+at /.test(frame)).map(frame => frame.slice(0, 250)) : [] }));
        throw error;
      }
    },
  },
});
