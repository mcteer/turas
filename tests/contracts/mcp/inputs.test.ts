import { describe, expect, it } from "vitest";
import { mcpCreateConnectionSchema, mcpToolInputs, mcpToolNames } from "../../../lib/contracts/mcp";

const customerId = "10000000-0000-4000-8000-000000000001";
describe("MCP strict inputs", () => {
  it("exposes exactly twelve fixed read tools", () => {
    expect(mcpToolNames).toHaveLength(12);
    expect(new Set(mcpToolNames).size).toBe(12);
    expect(mcpToolInputs.turas_identity_v1.safeParse({role:"admin"}).success).toBe(false);
  });
  it("rejects coercion, oversized pages and extra write arguments", () => {
    for (const limit of [0,21,"1",1.5]) expect(mcpToolInputs.turas_customers_list_v1.safeParse({limit}).success).toBe(false);
    expect(mcpToolInputs.turas_profile_read_v1.safeParse({customerId,section:"facts",approve:true}).success).toBe(false);
    expect(mcpToolInputs.turas_customers_list_v1.safeParse({limit:20,cursor:"x".repeat(257)}).success).toBe(false);
  });
  it("requires explicit distinct scopes and currently selected customer identities", () => {
    const base = {requestKey:customerId,name:"Assistant",categories:["profiles"],customerIds:[customerId]};
    expect(mcpCreateConnectionSchema.parse(base).lifetimeDays).toBe(7);
    for (const change of [{categories:[]},{categories:["profiles","profiles"]},{customerIds:[]},{customerIds:[customerId,customerId]},{role:"admin"},{lifetimeDays:31}]) {
      expect(mcpCreateConnectionSchema.safeParse({...base,...change}).success).toBe(false);
    }
    expect(mcpCreateConnectionSchema.safeParse({...base,categories:["knowledge"],customerIds:[]}).success).toBe(true);
  });
});
