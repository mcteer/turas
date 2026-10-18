import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
/** The recorded owner reset closes new admission before any native request. */
export async function assertNativeConversationOpen(db:PoolClient,id:string){
 const marker=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0];
 if(Number(marker?.schema_version??0)>=76&&(await db.query('SELECT 1 FROM ordinary_native_retirements WHERE conversation_id=$1',[id])).rowCount)
  throw new HttpFailure(409,'conversation_retired','Start a new conversation after retiring this one');
}
