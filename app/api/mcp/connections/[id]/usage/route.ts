import { getMcpManagement } from '../../../../../../lib/server/mcp/http-management';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  return getMcpManagement(request,false,(await context.params).id);
}
