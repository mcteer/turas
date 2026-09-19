import { defineTool } from "eve/tools";
import { z } from "zod";
const sources = [
  { id: "src-vercel-ai", title: "Vercel AI Gateway documentation", publisher: "Vercel", url: "https://vercel.com/docs/ai-gateway", sourceType: "primary technical documentation", retrievedAt: "2026-09-19", supports: "Model routing, observability, and provider selection controls." },
  { id: "src-vercel-workflow", title: "Vercel Workflows documentation", publisher: "Vercel", url: "https://vercel.com/docs/workflows", sourceType: "primary technical documentation", retrievedAt: "2026-09-19", supports: "Durable workflow execution and human-in-the-loop resumption." },
  { id: "src-eve-hitl", title: "eve Human-in-the-Loop documentation", publisher: "Vercel", url: "https://eve.dev/docs/tools/human-in-the-loop", sourceType: "primary technical documentation", retrievedAt: "2026-09-19", supports: "Approval-gated actions pause and resume durably." },
];
export default defineTool({ description: "Return the small reviewed public source pack for a cited implementation and adoption proposal.", inputSchema: z.object({ question: z.string().min(1).max(1000) }), execute: () => ({ sources, limitations: "This small source pack supports implementation controls, not evidence that a fictional customer will achieve value." }) });
