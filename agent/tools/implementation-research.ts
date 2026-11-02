import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import {runImplementationResearch} from "../lib/legacy-research/specialist-workflows";

// The current eve release accepts the authored return contract on invocation,
// rather than defineAgent.outputSchema. The model cannot select another schema.

export default defineWorkflowTool({
  description: "Run the reserved implementation-research specialist after prepare_customer_research admits its exact account and purpose. Returns working while the specialist works; its completion is delivered automatically. For an explicitly requested refinement, first prepare the same customer, kind and workload with the exact new question and refresh true, then call this tool with the existing taskId from its actual receipt. Do not substitute a direct rewrite or omit taskId to start a replacement. Do not launch duplicate work or copy lease identifiers.",
  inputSchema: z.object({message:z.string().min(1).max(20000)}).strict(),
  serve:runImplementationResearch,
});

