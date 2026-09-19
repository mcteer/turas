import { defineTool } from "eve/tools";
import { z } from "zod";
import { getPortfolioSummary } from "@/lib/demo/repository";
export default defineTool({ description: "Retrieve the synthetic portfolio summary and exceptions for the fixed reporting date.", inputSchema: z.object({}), execute: () => ({ synthetic: true, ...getPortfolioSummary() }) });
