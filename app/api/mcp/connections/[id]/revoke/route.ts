import { postMcpManagement } from '../../../../../../lib/server/mcp/http-management';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  return postMcpManagement(request,(await context.params).id);
}
