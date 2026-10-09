import {withTransaction} from '../db/client';
import {maintainGapRetention} from './maintenance';
import {getServerConfig} from '../config';
import {claimGapReportJobs,recoverGapReportJobs,runGapReportJob} from './report-jobs';
/** Independent readiness: 009 enablement cannot gate 012 work or cleanup. */
export async function tickGapWorker(){
 const version=await withTransaction(async db=>{const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment LIMIT 1')).rows[0];if(marker?.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID)return 0;const version=Number(marker.schema_version);if(version>=48)await db.query('SELECT turas_gap_purge_payloads($1,100)',[marker.environment_id]);return version;});
 if(version<49)return;
 await recoverGapReportJobs();
 await maintainGapRetention();
 for(const job of await claimGapReportJobs(1))await runGapReportJob(job);
}
