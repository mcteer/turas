import catalog from './pilot-suites.json';
/** Whole-file bounds cover the explicitly declared setup/case phases plus
 * startup and cleanup. Domain, hook, statement and per-case limits stay fixed.
 * The complete catalog retains its independent ninety-minute batch orchestration deadline. */
const longSuiteSeconds:Readonly<Record<string,number>>={
 'managed-workflow-batch':180,
 'maintenance-worker':240,'hosted-runtime-database':240,'evaluation-visible-identifiers':240,
 'native-postgres':300,'required-objects':300,'hosted-training-admission':300,
 'linked-http-reports':360,'linked-http-training':360,'linked-http-workforce':360,'hosted-browser':360,
 'lifecycle':420,
 'database-safety-content':480,'work-isolated-restore':480,'preview-safety-restore':480,'profile-projection-review':480,'recovery-current-grants':480,
 'hosted-sdk':600,'recovery-logout':660,
 'hosted-paid-admission':720,'recovery-model-holds':720,'recovery-token-allowance':720,'recovery-read-probe':720,
 'evaluation-source':780,
 'provisioning':840,'runtime-retirement':840,'image-health':840,'backup-health':840,
 'load-fixture':840,'load-delivery':840,'load-training':840,'load-internal':840,'load-learning':840,
 'isolated-restore':900,'released-safety-restore':1140,'capture-candidate':900,'recovery-denial-snapshot':900,'owned-denial-command':900,
 'load-mcp':960,'owned-database-restore':1200,'store-observations':1260,
 'legacy-safety-restore':1320,'recovery-resolution':1320,'health':1440,'storage-cutover':1560,
 'recovery-authority':1740,'recovery':1980,'hosted-role-reads':2160,'neon-archive':2160,
 'recovery-quarantine':2400,'recovery-credential-denials':3420,
};
for(const name of Object.keys(longSuiteSeconds)){
 if(!catalog.suites.some(suite=>suite.file==='tests/integration/pilot/'+name+'.test.ts'))throw Error('Unregistered pilot deadline override');
}
export function pilotSuiteDeadlineMs(file:string){
 if(!catalog.suites.some(suite=>suite.file===file))throw Error('Registered pilot suite required');
 if(file==='tests/unit/pilot/quality.test.ts')return 180000;
 const name=/^tests\/integration\/pilot\/([a-z0-9-]+)\.test\.ts$/.exec(file)?.[1];
 return (name?longSuiteSeconds[name]??120:120)*1000;
}
