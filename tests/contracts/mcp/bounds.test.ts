import { describe, expect, it } from "vitest";
import { mcpDigestSchema,mcpGenerationSchema,mcpTimestampSchema,mcpResponseFits,mcpProfilePayloadSchema,mcpPlanContentSchema } from "../../../lib/contracts/mcp";
describe("MCP output bounds",()=>{
  it("requires canonical identities, digests, generations and UTC timestamps",()=>{
    for(const value of [0,1.5,Number.MAX_SAFE_INTEGER+1])expect(mcpGenerationSchema.safeParse(value).success).toBe(false);
    expect(mcpGenerationSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
    expect(mcpDigestSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(mcpTimestampSchema.safeParse("2026-10-10T12:00:00+00:00").success).toBe(false);
    expect(mcpTimestampSchema.safeParse("2026-10-10T12:00:00.000Z").success).toBe(true);
  });
  it("counts UTF-8 bytes including wrapper, rather than characters",()=>{
    expect(mcpResponseFits({content:[{type:"text",text:"😀".repeat(33000)}]})).toBe(false);
    expect(mcpResponseFits({content:[{type:"text",text:"x".repeat(130000)}]})).toBe(true);
  });
  it("rejects private lineage instead of passing through unknown fields",()=>{
    const claim={kind:"claim",text:"Reviewed fact",sourceType:"manual",evidenceRevisionIds:[]};
    expect(mcpProfilePayloadSchema.safeParse(claim).success).toBe(true);
    expect(mcpProfilePayloadSchema.safeParse({kind:'product_use',productKey:'synthetic',displayName:'Synthetic',state:'unknown',usageDescription:'Unknown usage',observedAt:'2026-01-01T00:00:00+00:00',evidenceRevisionIds:[]}).success).toBe(false);
    expect(mcpProfilePayloadSchema.safeParse({...claim,sourceMessageId:"10000000-0000-4000-8000-000000000001"}).success).toBe(false);
    expect(mcpPlanContentSchema.safeParse({arbitrary:"draft"}).success).toBe(false);
  });
});
