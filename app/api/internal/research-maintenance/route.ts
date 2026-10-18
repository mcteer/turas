import {authorizeHostedWatchdog} from '../../../../lib/server/conversations/hosted-watchdog';
import {getServerConfig} from '../../../../lib/server/config';
import {maintainResearchEvidence} from '../../../../lib/server/research/specialists/research-cache/maintenance';
import {failure,success} from '../../../../lib/contracts/http';

export const dynamic='force-dynamic';
export const maxDuration=90;

export async function GET(request:Request){
 try{
  authorizeHostedWatchdog(request);
  return success(await maintainResearchEvidence(getServerConfig().TURAS_ENVIRONMENT_ID,
   AbortSignal.any([request.signal,AbortSignal.timeout(80000)])));
 }catch(error){return failure(error);}
}
