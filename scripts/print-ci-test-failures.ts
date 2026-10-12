import {readdir,lstat,readFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
export function redactTestDiagnostic(value:string){
 return value.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'')
  .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/g,'[redacted-uri]')
  .replace(/\b(?:password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,'[redacted-credential]')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g,'[redacted-opaque-value]')
  .replace(/(['"])[^'"\n]{1,1000}\1/g,'[redacted-value]').slice(0,2000);
}
/** CI-only bounded diagnostics. No environment, database, original artifact,
 * workflow state, model output or complete test payload is emitted. */
export async function printCiTestFailures(){
 if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||resolve(process.env.GITHUB_WORKSPACE??'')!==process.cwd())throw Error('Actual CI workspace required');
 const root=resolve('local-artifacts'),skip=new Set(['node_modules','.git','.eve','app','store','objects','private-reports','runtime-assets','context','staging','images']);
 let visited=0,bytes=0,printed=0;const seen=new Set<string>();
 async function walk(directory:string,depth:number):Promise<void>{
  if(depth>8||visited>=2000||bytes>=67108864||printed>=30)return;
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch{return;}
  for(const entry of entries){
   if(visited>=2000||bytes>=67108864||printed>=30)return;
   if(entry.isSymbolicLink()||entry.name.startsWith('.')||skip.has(entry.name))continue;
   const file=join(directory,entry.name);
   if(entry.isDirectory()){await walk(file,depth+1);continue;}
   if(!entry.isFile()||!entry.name.endsWith('.json'))continue;visited++;
   const size=(await lstat(file)).size;if(size>1048576)continue;bytes+=size;
   let report:any;try{report=JSON.parse(await readFile(file,'utf8'));}catch{continue;}
   if(report?.numFailedTests>0&&Array.isArray(report.testResults))for(const suite of report.testResults)for(const test of suite.assertionResults??[]){
    if(test.status!=='failed'||printed>=30)continue;
    const title=redactTestDiagnostic(String(test.title??'')),key=JSON.stringify([suite.name,title]);if(seen.has(key))continue;seen.add(key);
    console.info(JSON.stringify({kind:'ci_test_failure',report:relative(root,file),suite:redactTestDiagnostic(String(suite.name??'')),title,messages:(test.failureMessages??[]).slice(0,2).map((message:unknown)=>redactTestDiagnostic(String(message)))}));printed++;
   }
   if(entry.name.endsWith('-process.json')&&report?.deadlineExpired===true&&typeof report.file==='string'&&printed<30){console.info(JSON.stringify({kind:'ci_test_deadline',suite:redactTestDiagnostic(report.file)}));printed++;}
  }
 }
 await walk(root,0);console.info(JSON.stringify({kind:'ci_test_diagnostics',visitedReports:visited,failuresPrinted:printed,bounded:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)printCiTestFailures().catch(()=>{console.error('Bounded CI diagnostics unavailable');process.exitCode=1;});
