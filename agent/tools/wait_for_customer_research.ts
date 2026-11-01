import { defineWorkflowTool } from "eve/tools";
import {joinCustomerResearch} from "../lib/legacy-research/specialist-workflows";
import { z } from "zod";

export default defineWorkflowTool({
  description: "Join independently shared research already running after prepare_customer_research returns working. For a native specialist task owned by this chat, its result arrives automatically; do not call this tool to poll it. Other shared work waits durably without model polling or duplicate research. Returns the shared signed reference once it is eligible, or an explicit expired/unavailable result within ten minutes.",
  inputSchema: z.object({ key: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  task:joinCustomerResearch,
});

