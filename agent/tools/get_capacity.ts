import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCapacity } from "@/lib/demo/repository";
export default defineTool({ description: "Retrieve synthetic team capacity, utilization, skill constraints, and protected time.", inputSchema: z.object({}), execute: () => ({ synthetic: true, capacity: getCapacity() }) });
