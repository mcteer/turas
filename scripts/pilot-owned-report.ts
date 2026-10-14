import {runSyntheticReportRecipe} from './pilot-report-recipe';
export async function runOwnedReportJourney(input:Parameters<typeof runSyntheticReportRecipe>[0]){
 const {scope}=input;
 if(new URL(scope.origin).hostname!=='127.0.0.1'||!scope.environmentMarker.startsWith('test-pilot-')||process.env.TURAS_PILOT_OWNED!=='1'||process.env.TURAS_JOB_EXECUTOR!=='local')throw Error('Report execution is owned local only; no hosted paid admission implemented');
 const result=await runSyntheticReportRecipe(input);
 return {...result,contract:"pilot-owned-linked-reports-v1",providerCalls:0,hostedProof:false};
}
