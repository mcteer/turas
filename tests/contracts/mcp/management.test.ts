import { describe,expect,it } from "vitest";
import { mcpBearerSchema,mcpCreateReplySchema,mcpRevokeConnectionSchema } from "../../../lib/contracts/mcp";
describe('MCP management contract',()=>{
  it('binds revocation to an exact UUID and rejects widening',()=>{
    const id='10000000-0000-4000-8000-000000000001';
    expect(mcpRevokeConnectionSchema.safeParse({requestKey:id,expectedConnectionId:id,categories:['profiles']}).success).toBe(false);
    expect(mcpRevokeConnectionSchema.safeParse({requestKey:'retry',expectedConnectionId:id}).success).toBe(false);
  });
  it('requires a lookup identity plus a full independently generated secret',()=>{
    expect(mcpBearerSchema.safeParse('tmcp.10000000-0000-4000-8000-000000000001.'+'a'.repeat(43)).success).toBe(true);
    expect(mcpBearerSchema.safeParse('secret').success).toBe(false);
  });
  it('cannot return a plaintext credential in a reconciled replay',()=>{
    const connection={id:'10000000-0000-4000-8000-000000000001',name:'Synthetic assistant',categories:['knowledge'],createdAt:'2026-10-10T00:00:00.000Z',expiresAt:'2026-10-17T00:00:00.000Z',revokedAt:null,lastUsedAt:null,state:'active'};
    expect(mcpCreateReplySchema.safeParse({connection,secretAvailable:false}).success).toBe(true);
    expect(mcpCreateReplySchema.safeParse({connection,secretAvailable:false,credential:'lost'}).success).toBe(false);
  });
});
