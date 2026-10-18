import { defineWorkflowTool } from "eve/tools";
import {joinCustomerResearch} from "../lib/legacy-research/specialist-workflows";
import { z } from "zod";

export default defineWorkflowTool({
  description: "Join research already running after prepare_customer_research returns working. Waits durably without model polling or duplicate research. Returns the shared signed reference once it is eligible, or an explicit expired/unavailable result within ten minutes.",
  execution: "background",
  inputSchema: z.object({ key: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  execute:joinCustomerResearch,
});

