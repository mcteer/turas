import { reconcileMcpManagement } from '../../../../../../lib/server/mcp/http-management';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{key:string}>}){
  return reconcileMcpManagement(request,(await context.params).key);
}
