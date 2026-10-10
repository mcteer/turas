import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { McpReadActor } from "../auth/read-actor";
import { mcpToolOutputs,mcpResponseFits,mcpContractVersion,type McpCategory,type McpToolName } from "../../contracts/mcp";
import { requireMcpScope } from "./policy";

export function unavailableMcp(reason:"not_found"|"source_changed"|"incomplete"|"oversized"|"expired"|"unavailable",requestId:string=randomUUID()){
  return {contractVersion:mcpContractVersion,status:"unavailable" as const,requestId,data:null,nextCursor:null,reason};
}
/** Caller retains this transaction through SDK serialization and commit. */
export async function projectMcpTool(db:PoolClient,actor:McpReadActor,name:McpToolName,category:McpCategory|undefined,
  customerId:string|undefined,read:()=>Promise<unknown>){
  await requireMcpScope(db,actor,category,customerId);
  const candidate=await read();
  await requireMcpScope(db,actor,category,customerId);
  const parsed=mcpToolOutputs[name].safeParse(candidate);
  const output=parsed.success?parsed.data:unavailableMcp('unavailable');
  const wrapped={content:[{type:'text' as const,text:JSON.stringify(output)}],structuredContent:output};
  if(mcpResponseFits(wrapped))return wrapped;
  const small=unavailableMcp('oversized',output.requestId);
  return {content:[{type:'text' as const,text:JSON.stringify(small)}],structuredContent:small};
}
