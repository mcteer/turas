import {mkdir,lstat,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withTransaction} from '../lib/server/db/client';
import {registerReportBrand} from '../lib/server/reports/brand';
import {requireReportEnvironment} from '../lib/server/reports/readiness';
import {reportConfig} from '../lib/server/reports/config';
import {reportObjectDirectory} from '../lib/server/reports/store';
/** Explicit preparation creates only a new private, separately marked namespace. */
export async function prepareReportStore(){
 const config=reportConfig(),environmentId=process.env.TURAS_ENVIRONMENT_ID;
 if(!environmentId || !config.storeRoot)throw new Error('Explicit report environment and store required');
 const root=resolve(config.storeRoot);let exists=true;try{await lstat(root);}catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;exists=false;}
 if(exists){const stat=await lstat(root);if(!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)throw new Error('Private owned report directory required');
  const marker=JSON.parse(await readFile(join(root,'.turas-report-store.json'),'utf8'));if(marker.environmentId!==environmentId)throw new Error('Report ownership mismatch');
 }else{await mkdir(root,{recursive:true,mode:0o700});await writeFile(join(root,'.turas-report-store.json'),JSON.stringify({environmentId}),{flag:'wx',mode:0o600});}
 await reportObjectDirectory();
}
export async function prepareReports(){
 await prepareReportStore();
 await withTransaction(async db=>{await requireReportEnvironment(db);const workspaces=(await db.query('SELECT id FROM workspaces WHERE active ORDER BY id')).rows;for(const workspace of workspaces)await registerReportBrand(db,workspace.id);});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareReports().then(()=>console.log('Private report namespace prepared')).catch(()=>{console.error('Report preparation failed; verify explicit private namespace and environment');process.exitCode=1;});
