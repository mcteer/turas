import { hindsightRetainHook } from "@vectorize-io/hindsight-eve";
import { defineHook } from "eve/hooks";

// Preview deliberately has no Hindsight credentials until its isolation model
// is approved. An empty hook keeps the agent buildable without sharing the
// production memory bank or retaining preview conversations externally.
export default process.env.HINDSIGHT_API_KEY
  ? hindsightRetainHook()
  : defineHook({ events: {} });
