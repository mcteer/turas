import {requireOperationsAdministrator,readOperationalHealth} from '../../../../lib/server/operations/health';
import {failure,success} from '../../../../lib/contracts/http';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
 try{await requireOperationsAdministrator(request);return success(await readOperationalHealth());}
 catch(error){return failure(error);}
}
