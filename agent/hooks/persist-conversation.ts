import {projectSpecialistFact} from '../../lib/server/research/specialists/discussion-events';
import { defineHook } from "eve/hooks";
import {projectEveFact} from "../../lib/server/conversations/eve-events";
import { projectNativeEvent } from "../../lib/server/conversations/projection";

export default defineHook({
  events: {
    async "*"(event, ctx) {
      const attemptId = ctx.session.auth.current?.attributes.turasAttemptId;
      const inputEvent = event.type === "interaction.opened" || event.type === "interaction.settled";
      if (inputEvent) console.info(JSON.stringify({ event: "conversation.native_input_observed",
        type: event.type,...(event.type==='interaction.settled'?{outcome:event.data.outcome}:{}), hasAttempt: typeof attemptId === "string" }));
      await projectSpecialistFact(ctx.session.id,event,ctx.position,ctx.now.toISOString(),ctx.view);
      if (typeof attemptId !== "string") return;
      try {
        await projectNativeEvent(ctx.session.id, attemptId, projectEveFact(ctx.session.id,event,ctx.position,ctx.now.toISOString(),ctx.view),ctx.position.line);
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
