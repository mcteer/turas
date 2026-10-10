import { getMcpManagement,postMcpManagement } from '../../../../lib/server/mcp/http-management';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>getMcpManagement(request);
export const POST=(request:Request)=>postMcpManagement(request);
