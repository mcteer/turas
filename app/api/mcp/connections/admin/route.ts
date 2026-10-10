import { getMcpManagement } from '../../../../../lib/server/mcp/http-management';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>getMcpManagement(request,true);
