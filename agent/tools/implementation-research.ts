import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import {runImplementationResearch} from "../lib/legacy-research/specialist-workflows";

// The current eve release accepts the authored return contract on invocation,
// rather than defineAgent.outputSchema. The model cannot select another schema.

export default defineWorkflowTool({
  description: "Run the reserved implementation-research specialist after prepare_customer_research admits its exact account and purpose. Returns working while the original legacy specialist runs; its completion is delivered automatically. Do not launch duplicate work or copy lease identifiers.",
  execution: "background",
  inputSchema: z.object({message:z.string().min(1).max(20000),agentId:z.string().min(1).max(200).optional()}).strict(),
  execute:runImplementationResearch,
});

