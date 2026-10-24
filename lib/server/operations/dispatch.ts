import {HttpFailure} from '../../contracts/http';
import {query} from '../db/client';
import {getServerConfig} from '../config';
import {authorizeHostedWatchdog} from '../conversations/hosted-watchdog';
import {claimArtifactRun} from '../artifacts/jobs';
import {runArtifactJob} from '../artifacts/runner';
import {preparedArtifactImages} from '../artifacts/prepared';
import {claimWorkforceImport} from '../staffing/jobs';
import {runWorkforceImport} from '../staffing/runner';
import {claimReportJobs} from '../reports/jobs';
import {runReportRenderJob} from '../reports/render-jobs';
import {reportTransaction} from '../reports/commands';
import {reportConfig} from '../reports/config';
import {executionBackend,hostedExecutionCredentials,hostedCostConfiguration} from '../jobs/governed';
import {privateObjectBackend} from '../storage/factory';

import {claimGapReportJobs,runGapReportJob} from '../gaps/report-jobs';

export const heavyDispatchCatalog=Object.freeze(['artifact','workforce','report','gap-report'] as const);
export function authorizeHeavyDispatch(request:Request){
 authorizeHostedWatchdog(request);
 const url=new URL(request.url);
 if(url.pathname!=='/eve/v1/turas/jobs'||url.search||request.headers.get('content-length')&&!/^0$/.test(request.headers.get('content-length')!))throw new HttpFailure(403,'maintenance_denied','Action not allowed');
}
export async function assertHostedDispatchReady(){
 if(process.env.TURAS_PILOT_HOSTED_JOBS_ENABLED!=='1'||executionBackend()!=='sandbox'||privateObjectBackend()!=='blob')throw new HttpFailure(503,'unavailable','Hosted processing is disabled');
 hostedExecutionCredentials();preparedArtifactImages();const costs=hostedCostConfiguration();
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 const control=(await query("SELECT mode FROM operations_control WHERE environment_id=$1",[environmentId])).rows[0];
 if(control?.mode!=='open')throw new HttpFailure(503,'unavailable','Operational admission is closed');
 const allowed=(await query(`SELECT 1 FROM operations_cost_budgets b WHERE b.id=$1 AND b.environment_id=$2 AND b.category='sandbox' AND b.scope_digest=$3 AND b.pricing_digest=$4 AND b.state='active' AND b.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM operations_cost_reservations r WHERE r.budget_id=b.id AND r.state='unknown')`,[costs.budgetId,environmentId,costs.scopeDigest,costs.pricingDigest])).rowCount;
 if(!allowed)throw new HttpFailure(503,'unavailable','Hosted cost admission unavailable');
}
/** The scheduler selects no user-supplied operation and dispatches no model or mail work. */
export async function runHostedHeavyDispatch(parentSignal?:AbortSignal){
 const signal=parentSignal?AbortSignal.any([parentSignal,AbortSignal.timeout(360000)]):AbortSignal.timeout(360000);
 signal.throwIfAborted();
 await assertHostedDispatchReady();
 // Rotation gives each fixed domain a first position without accepting a route argument.
 const offset=Math.floor(Date.now()/60000)%heavyDispatchCatalog.length;
 for(let index=0;index<heavyDispatchCatalog.length;index++){
  signal.throwIfAborted();
  switch(heavyDispatchCatalog[(offset+index)%heavyDispatchCatalog.length]){
   case 'artifact':{const claim=await claimArtifactRun();if(claim){await runArtifactJob(claim,signal);return {state:'processed' as const,kind:'artifact' as const};}break;}
   case 'workforce':{const claim=await claimWorkforceImport();if(claim){await runWorkforceImport(claim,signal);return {state:'processed' as const,kind:'workforce' as const};}break;}
   case 'gap-report':{const [claim]=await claimGapReportJobs(1);if(claim){signal.throwIfAborted();await runGapReportJob(claim);return {state:'processed' as const,kind:'gap-report' as const};}break;}
   case 'report':{if(!reportConfig().enabled)break;const [claim]=await reportTransaction(db=>claimReportJobs(db,'render',1));if(claim){await runReportRenderJob(claim,signal);return {state:'processed' as const,kind:'report' as const};}break;}
  }
 }
 return {state:'idle' as const};
}
