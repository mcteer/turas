import {runSyntheticSourceRecipe} from './pilot-source-recipe';
export {sourceWithdrawalCommand} from './pilot-source-recipe';
export async function runOwnedSourceJourney(input:Parameters<typeof runSyntheticSourceRecipe>[0]){
 const {scope}=input;
 if(new URL(scope.origin).hostname!=='127.0.0.1'||!scope.environmentMarker.startsWith('test-pilot-')||process.env.TURAS_PILOT_OWNED!=='1'||process.env.TURAS_JOB_EXECUTOR!=='local')throw Error('Source execution is owned local only; no hosted paid admission implemented');
 const result=await runSyntheticSourceRecipe(input);
 return {...result,contract:"pilot-owned-source-v1",providerCalls:0,hostedProof:false};
}
