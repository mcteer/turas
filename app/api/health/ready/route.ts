import {readOperationalHealth} from '../../../../lib/server/operations/health';
export const dynamic='force-dynamic';
export async function GET():Promise<Response>{
 let ready=false;try{ready=(await readOperationalHealth()).ready;}catch{}
 return Response.json({ready},{status:ready?200:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
