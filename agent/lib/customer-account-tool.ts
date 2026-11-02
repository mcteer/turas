import type {DynamicToolResult} from 'eve/tools';
import { defineDynamic } from "eve/tools";
import { responseFeature } from "../../lib/server/conversations/feature";

/** Shared capability selection for the restored legacy customer-read tools. */
export function customerAccountTool<T extends DynamicToolResult>(tool: T) {
  return defineDynamic(async (ctx) => {
      const feature = await responseFeature(ctx.session.auth.current);
      return ["staffing", "execution", "support", "expansion", "learning"]
        .includes(feature?.kind ?? "") ? null : tool;
    });
}
