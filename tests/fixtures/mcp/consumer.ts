import { Client,StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mcpProtocolVersion } from "../../../lib/contracts/mcp";
import { requireOwnedMcpDatabase } from "../../../scripts/mcp-environment";

/** Actual pinned SDK consumer. Bearer remains in memory and never in URLs/captures. */
export async function withMcpConsumer<T>(origin:string,bearer:string,run:(client:Client)=>Promise<T>){
  requireOwnedMcpDatabase();
  if(new URL(origin).hostname!=='127.0.0.1' || new URL(origin).origin!==process.env.TURAS_APP_ORIGIN)throw Error('Consumer requires owned app origin');
  const client=new Client({name:'turas-owned-consumer',version:'1.0.0'},
    {versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});
  const transport=new StreamableHTTPClientTransport(new URL('/api/mcp/v1',origin),
    {requestInit:{headers:{Authorization:'Bearer '+bearer}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}});
  try{await client.connect(transport);return await run(client);}finally{await client.close();}
}
