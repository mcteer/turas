import { defineDynamic } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";

/** Shared capability selection for the restored legacy customer-read tools. */
export function customerAccountTool<T>(tool: T) {
  return defineDynamic({ events: {
    async "turn.started"(_event, ctx) {
      const feature = await responseFeature(ctx.session.auth.current);
      return ["staffing", "execution", "support", "expansion", "learning"]
        .includes(feature?.kind ?? "") ? null : tool;
    },
  } });
}
