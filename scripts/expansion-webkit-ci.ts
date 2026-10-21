import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {executionUiDiscovery,verifyExecutionUiReport,type ExecutionUiCase} from './execution-ui-report';

export const expansionWebkitProjects=['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark'] as const;
export const expansionWebkitSpecs=['tests/ui/expansion-authoring.spec.ts','tests/ui/expansion-decisions.spec.ts','tests/ui/expansion-review-queue.spec.ts','tests/ui/expansion-advice.spec.ts'] as const;
const hex=z.string().regex(/^[a-f0-9]{64}$/),sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
export const expansionCiBindingSchema=z.strictObject({sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:hex,ciRunId:z.string().regex(/^\d{1,32}$/),ciRunAttempt:z.string().regex(/^[1-9]\d{0,5}$/)});
export type ExpansionCiBinding=z.infer<typeof expansionCiBindingSchema>;
const indexSchema=expansionCiBindingSchema.extend({contract:z.literal('expansion-webkit-project-v1'),project:z.enum(expansionWebkitProjects),files:z.array(z.strictObject({name:z.string().regex(/^(?:discovery|case-\d+)\.json$/),bytes:z.number().int().positive().max(10000000),digest:hex})).min(2).max(1001)}).strict();
// Strip titles, steps, output, attachments and configuration values before upload.
const resultSchema=z.object({status:z.string(),retry:z.number().int().nonnegative(),errors:z.array(z.unknown()).length(0),error:z.null().optional()});
const specSchema=z.object({id:z.string().min(1).max(1024),file:z.string().min(1).max(4096),line:z.number().int().positive(),ok:z.boolean(),tests:z.array(z.object({projectName:z.string(),projectId:z.string(),expectedStatus:z.literal('passed'),status:z.string(),results:z.array(resultSchema)})).min(1)});
type Suite={specs?:z.infer<typeof specSchema>[];suites?:Suite[]};
const suiteSchema:z.ZodType<Suite>=z.lazy(()=>z.object({specs:z.array(specSchema).optional(),suites:z.array(suiteSchema).optional()}));
const count=z.number().int().nonnegative().max(10000);
const safeReportSchema=z.object({config:z.object({rootDir:z.string()}),suites:z.array(suiteSchema),errors:z.array(z.unknown()).length(0),stats:z.object({expected:count,unexpected:count,skipped:count,flaky:count})});
const safeReport=(raw:unknown)=>safeReportSchema.parse(raw);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function verifyCase(raw:unknown,expected:ExecutionUiCase){
 const counts=verifyExecutionUiReport(raw,[expected]),report=safeReport(raw),identities:ExecutionUiCase[]=[];
 function visit(suites:Suite[]){for(const suite of suites){for(const spec of suite.specs??[])for(const test of spec.tests)identities.push({file:resolve(report.config.rootDir,spec.file),id:spec.id,line:spec.line,project:test.projectName});visit(suite.suites??[]);}}
 visit(report.suites);if(identities.length!==1||identities[0].file!==expected.file||identities[0].id!==expected.id||identities[0].line!==expected.line||identities[0].project!==expected.project)throw Error('Exact discovered file, case, line and project required');return counts;
}


export async function writeExpansionCiProject(root:string,binding:ExpansionCiBinding,project:string,discovery:unknown,reports:unknown[]){
 binding=expansionCiBindingSchema.parse(binding);if(!expansionWebkitProjects.includes(project as typeof expansionWebkitProjects[number]))throw Error('Exact full WebKit project required');
 const cases=executionUiDiscovery(discovery,expansionWebkitSpecs,project);if(cases.length<7||reports.length!==cases.length)throw Error('Every full-project case required');
 reports.forEach((report,i)=>verifyCase(report,cases[i]));
 await mkdir(root,{mode:0o700});const files=[];
 for(const [i,raw]of[discovery,...reports].entries()){const name=i===0?'discovery.json':`case-${i-1}.json`,bytes=Buffer.from(JSON.stringify(safeReport(raw)));if(bytes.length>10000000)throw Error('Bounded safe UI report required');await writeFile(join(root,name),bytes,{mode:0o600,flag:'wx'});files.push({name,bytes:bytes.length,digest:sha(bytes)});}
 const index=indexSchema.parse({contract:'expansion-webkit-project-v1',...binding,project,files});await writeFile(join(root,'index.json'),JSON.stringify(index),{mode:0o600,flag:'wx'});
}
async function artifact(root:string,name:string){const p=join(root,name),info=await lstat(p);if(!info.isFile()||info.isSymbolicLink()||info.size>10000000)throw Error('Bounded regular artifact required');const bytes=await readFile(p);if(bytes.length!==info.size)throw Error('Artifact changed during read');return bytes;}
/** All four actual jobs and the independently discovered complete case union are mandatory. */
export async function verifyExpansionCiProjects(root:string,rawBinding:ExpansionCiBinding,discoveries:Record<string,unknown>,jobsResult:string){
 const rootInfo=await lstat(root);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw Error('Regular artifact root required');
 const binding=expansionCiBindingSchema.parse(rawBinding);if(jobsResult!=='success')throw Error('Every WebKit project job must succeed');
 const folders=expansionWebkitProjects.map(project=>`expansion-webkit-${binding.ciRunAttempt}-${project}`);
 if(!same((await readdir(root)).sort(),[...folders].sort()))throw Error('Exactly four current-attempt project artifacts required');
 let passed=0;
 for(const [i,project]of expansionWebkitProjects.entries()){
  const directory=join(root,folders[i]),info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Regular project artifact directory required');
  const index=indexSchema.parse(JSON.parse((await artifact(directory,'index.json')).toString()));
  if(index.project!==project||Object.keys(binding).some(k=>index[k as keyof ExpansionCiBinding]!==binding[k as keyof ExpansionCiBinding]))throw Error('Exact current source, run and attempt required');
  const expected=executionUiDiscovery(discoveries[project],expansionWebkitSpecs,project);if(expected.length<7)throw Error('Complete checked-in discovery required');
  const names=['discovery.json',...expected.map((_,j)=>`case-${j}.json`)];if(!same(index.files.map(f=>f.name),names)||!same((await readdir(directory)).sort(),['index.json',...names].sort()))throw Error('Exact complete project file inventory required');
  let total=0;const reports=[];for(const file of index.files){const bytes=await artifact(directory,file.name);total+=bytes.length;if(total>40000000||bytes.length!==file.bytes||sha(bytes)!==file.digest)throw Error('Bounded immutable report manifest required');reports.push(JSON.parse(bytes.toString()));}
  const actual=executionUiDiscovery(reports[0],expansionWebkitSpecs,project);if(!same(actual,expected))throw Error('Uploaded discovery differs from the current complete case inventory');
  for(const [j,item]of expected.entries()){const result=verifyCase(reports[j+1],item);passed+=result.expected;}
 }
 return{contract:'expansion-webkit-complete-v1' as const,...binding,projects:4,passed,skipped:0,flaky:0,retries:0,fullAcceptance:true};
}
