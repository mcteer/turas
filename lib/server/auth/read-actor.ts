import type { DemoIdentity } from "./credentials";
import type { CurrentSession } from "./sessions";
import type { McpCategory } from "../../contracts/mcp";

/** Independent read authority; deliberately has no browser session or token. */
export type McpReadActor = DemoIdentity & {
  authority:"mcp";
  connectionId:string;
  environmentId:string;
  categories:readonly McpCategory[];
  scopeDigest:string;
  expiresAt:Date;
};
export type CurrentReadActor = CurrentSession | McpReadActor;
export function isMcpReadActor(actor:CurrentReadActor):actor is McpReadActor {
  return "authority" in actor && actor.authority==="mcp";
}
