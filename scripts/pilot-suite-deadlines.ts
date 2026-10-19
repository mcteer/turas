import catalog from './pilot-suites.json';
/** Whole-file controller bounds include fixture setup and all test cases.
 * Domain, hook, statement and per-case deadlines remain independently enforced. */
export function pilotSuiteDeadlineMs(file:string){
 if(!catalog.suites.some(suite=>suite.file===file))throw Error('Registered pilot suite required');
 if(['tests/integration/pilot/isolated-restore.test.ts','tests/integration/pilot/released-safety-restore.test.ts'].includes(file))return 900000;
 if(['tests/integration/pilot/load-fixture.test.ts','tests/integration/pilot/load-delivery.test.ts','tests/integration/pilot/load-training.test.ts','tests/integration/pilot/load-mcp.test.ts','tests/integration/pilot/load-internal.test.ts','tests/integration/pilot/load-learning.test.ts'].includes(file))return 660000;
 if(file==='tests/integration/pilot/owned-database-restore.test.ts')return 720000;
 if(file==='tests/integration/pilot/evaluation-source.test.ts')return 780000;
 if(file==='tests/integration/pilot/recovery-credential-denials.test.ts')return 240000;
 if(['tests/integration/pilot/recovery-read-probe.test.ts','tests/integration/pilot/recovery.test.ts','tests/integration/pilot/hosted-sdk.test.ts','tests/integration/pilot/linked-http-reports.test.ts','tests/integration/pilot/linked-http-training.test.ts','tests/integration/pilot/hosted-browser.test.ts'].includes(file))return 300000;
 return 120000;
}
