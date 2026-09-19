import { hindsightMemory } from "@vectorize-io/hindsight-eve";
import { defineInstructions } from "eve/instructions";

// Resolve provider-backed recall only where the runtime was given explicit
// credentials. Preview otherwise remains isolated and uses no shared recall.
export default process.env.HINDSIGHT_API_KEY
  ? hindsightMemory()
  : defineInstructions({ content: "" });
