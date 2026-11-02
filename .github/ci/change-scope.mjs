import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const workflows=['ci.yml','legacy-backend-parity.yml'];
const sha=/^[a-f0-9]{40}$/;
export const gates={
 'governed-learning':{key:'gate',all:['deterministic','native','webkit','recovery','benchmark','evaluation-fixture','regressions']},
 'partner-enablement':{key:'gate',all:['deterministic','webkit','recovery','benchmark','regressions']},
 expansion:{key:'gate',all:['deterministic','native','recovery','benchmark','evaluation-fixture','regressions']},
 'expansion-webkit-projects':{key:'project',all:['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark']},
 'support-deterministic':{key:'gate',all:['deterministic','webkit']},
 reporting:{key:'gate',all:['deterministic','regressions','webkit']},
 execution:{key:'gate',all:['deterministic','regressions','webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark']},
 'product-gaps':{key:'gate',all:['deterministic','webkit','recovery','benchmark','regressions']},
 'read-only-mcp':{key:'gate',all:['deterministic','consumer','build','webkit','recovery','benchmark','regressions']},
 'legacy-chat':{key:'flow',all:['text-preferences','file-preferences','file-corrections']},
 'pilot-hardening':{key:'gate',all:['deterministic','webkit','regressions']},
 acceptance:{key:'gate',all:['domains','webkit','native-operations','native-staged-4','native-staged-10','native-task-state','native-questions','native-specialists']},
};
export const coreJobs=['verify','expansion-webkit-complete','execution-webkit-complete'];
// These drivers assert browser behavior despite their historical gate names.
export const browserFlows={
 'legacy-chat':['text-preferences','file-preferences','file-corrections'],
 acceptance:['native-staged-4','native-staged-10','native-task-state','native-questions','native-specialists'],
};
export const outputKey=name=>name.replaceAll('-','_');
export function gatePlan(mode){
 if(!['full','ui','none'].includes(mode))throw Error('Unknown CI mode');
 const result={mode,full:String(mode==='full')};
 for(const [name,gate] of Object.entries(gates)){
  const selected=mode==='full'?gate.all:mode==='ui'?gate.all.filter(value=>value.startsWith('webkit')||browserFlows[name]?.includes(value)):[];
  result['run_'+outputKey(name)]=String(selected.length>0);
  result['matrix_'+outputKey(name)]=JSON.stringify(selected.length?selected:['_not_selected']);
 }
 for(const name of coreJobs)result['run_'+outputKey(name)]=String(mode!=='none');
 return result;
}
const doc=path=>/^(?:README|AGENTS|CONTRIBUTING|ROADMAP)\.md$/.test(path)||/^(?:docs|specs)\/.*\.md$/.test(path)||path==='.specify/memory/constitution.md'||path==='.github/pull_request_template.md';
const ui=path=>/^app\/.*\.css$/.test(path)||/^app\/_components\/.*\.tsx$/.test(path)||path==='app/login/login-form.tsx';
const ci=path=>/^\.github\/ci\/change-scope(?:\.test)?\.mjs$/.test(path)||/^\.github\/workflows\/(?:ci|legacy-backend-parity)\.yml$/.test(path);
export function classify(paths){
 if(paths.every(doc))return 'documentation';
 if(paths.every(path=>doc(path)||ui(path)))return 'ui-candidate';
 if(paths.every(path=>doc(path)||ci(path)))return 'ci-only';
 if(paths.every(path=>doc(path)||ui(path)||ci(path)))return 'ui-ci-candidate';
 return 'full';
}

// Deliberately narrow normalization: scheduling wrappers only. Commands,
// matrices, runners, step conditions, permissions and setup remain byte-bound.
export function executionContract(source){
 if(!source.endsWith('\n'))throw Error('Workflow newline required');
 const split=source.indexOf('\njobs:\n');if(split<0)throw Error('Missing workflow jobs');
 const prefix=source.slice(0,split),body=source.slice(split+7);
 const starts=[...body.matchAll(/^  ([a-z][a-z0-9-]*):\s*$/gm)];
 if(!starts.length||new Set(starts.map(m=>m[1])).size!==starts.length)throw Error('Invalid workflow inventory');
 const jobs=[];
 for(let i=0;i<starts.length;i++){
  const name=starts[i][1];if(['scope','ci-result'].includes(name))continue;
  let block=body.slice(starts[i].index,starts[i+1]?.index??body.length);
  block=block.replace(/^    needs: scope\n/m,'')
   .replace(/^    needs: \[scope, ([a-z][a-z0-9-]*)\]\n/m,'    needs: $1\n')
   .replace(/^    if: \$\{\{ needs\.scope\.outputs\.full == 'true' \}\}\n/m,'')
   .replace(/^    if: \$\{\{ always\(\) && needs\.scope\.outputs\.full == 'true' \}\}\n/m,'    if: always()\n');
  block=block.replace(/^        if: \$\{\{ needs\.scope\.outputs\.mode != 'ui' \}\}\n/gm,'');
  const key=outputKey(name);
  block=block.replace(`    if: \${{ needs.scope.outputs.run_${key} == 'true' }}\n`,'')
   .replace(`    if: \${{ always() && needs.scope.outputs.run_${key} == 'true' }}\n`,'    if: always()\n');
  if(gates[name])block=block.replace(`        ${gates[name].key}: \${{ fromJSON(needs.scope.outputs.matrix_${key}) }}`,`        ${gates[name].key}: [${gates[name].all.join(', ')}]`);
  jobs.push(block.replace(/\n(?:[ \t]*\n)*$/u,''));
 }
 return JSON.stringify({prefix,jobs});
}

export function successfulExecution(run,jobs,{repo,minimum}){
 return run.status==='completed'&&run.conclusion==='success'&&run.repository?.full_name===repo&&sha.test(run.head_sha??'')&&jobs.length>=minimum&&jobs.every(j=>j.status==='completed'&&j.conclusion==='success');
}
const gitRaw=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const git=(...args)=>gitRaw(...args).trim();
const changes=(base,head)=>git('diff','--name-only','--no-renames',base,head).split('\n').filter(Boolean);
function ordinaryFiles(paths,base,head){
 for(const revision of [base,head])for(const path of paths){
  const entry=git('ls-tree',revision,'--',path);if(entry&&!entry.startsWith('100644 ')&&!entry.startsWith('100755 '))return false;
 }
 return true;
}
function clientFiles(paths,base,head){
 return paths.filter(ui).every(path=>[base,head].every(revision=>{
  try{const source=git('show',`${revision}:${path}`);return path.endsWith('.css')||/^(?:"use client"|'use client')\s*;?/.test(source.trimStart());}catch{return false;}
 }));
}
export async function select({event,token,api=fetch}){
 const repo=event.repository?.full_name,head=event.pull_request?.head?.sha??event.after,base=event.pull_request?.base?.sha??event.before;
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo??'')||!sha.test(head??'')||!sha.test(base??'')||base==='0'.repeat(40))return {full:true,mode:'full',reason:'Missing trusted comparison; broad checks required'};
 if(git('rev-parse','HEAD')!==head)throw Error('Checkout must match the actual event head');
 const paths=changes(base,head),kind=classify(paths);
 if(kind==='documentation'&&ordinaryFiles(paths,base,head))return {full:false,mode:'none',reason:'Documentation-only complete base-to-head diff',paths};
 if(kind==='ui-candidate'&&ordinaryFiles(paths,base,head)){
  const clientOnly=clientFiles(paths,base,head);
  if(clientOnly)return {full:false,mode:'ui',reason:'Existing client-component/style changes only; all browser projects and core build checks selected',paths};
 }
 const request=async path=>{
  const response=await api(`https://api.github.com/repos/${repo}/${path}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Trusted CI metadata unavailable');return response.json();
 };
 try{
  const [main,legacy]=await Promise.all(workflows.map(name=>request(`actions/workflows/${name}/runs?status=success&per_page=50`)));
  for(const candidate of main.workflow_runs??[]){
   const prior=candidate.head_sha;if(!sha.test(prior??'')||prior===head)continue;
   const companion=(legacy.workflow_runs??[]).find(r=>r.head_sha===prior&&r.conclusion==='success');if(!companion)continue;
   try{git('cat-file','-e',`${prior}^{commit}`);}catch{git('fetch','--no-tags','origin',prior);}
   const delta=changes(prior,head),deltaKind=classify(delta);if(!['documentation','ci-only','ui-candidate','ui-ci-candidate'].includes(deltaKind)||!ordinaryFiles(delta,prior,head))continue;
   const clientDelta=['ui-candidate','ui-ci-candidate'].includes(deltaKind);if(clientDelta&&!clientFiles(delta,prior,head))continue;
   if(!workflows.every(name=>executionContract(gitRaw('show',`${prior}:.github/workflows/${name}`))===executionContract(gitRaw('show',`${head}:.github/workflows/${name}`))))continue;
   // Same PR/base, or a merged source already in the comparison base/current
   // merge. An unrelated green branch cannot supply the baseline.
   let related=false;
   for(const reference of candidate.pull_requests??[]){
    if(reference.head?.sha!==prior||!sha.test(reference.base?.sha??''))continue;
    if(!(companion.pull_requests??[]).some(r=>r.number===reference.number&&r.head?.sha===prior&&r.base?.sha===reference.base.sha))continue;
    const pr=await request(`pulls/${reference.number}`);
    if(pr.number===event.pull_request?.number&&pr.base?.sha===base&&reference.base.sha===base){
     try{
      git('merge-base','--is-ancestor',prior,head);
      // Some original jobs check out the PR head and others GitHub's merge.
      // Reuse only when both checkout contexts have the same actual trees.
      if(git('merge-tree','--write-tree',base,prior)!==git('rev-parse',`${prior}^{tree}`)||git('merge-tree','--write-tree',base,head)!==git('rev-parse',`${head}^{tree}`))continue;
      related=true;break;
     }catch{}
    }
    if(pr.merged&&sha.test(pr.merge_commit_sha??'')){
     if(pr.head?.sha!==prior){
      if(!sha.test(pr.head?.sha??''))continue;
      try{
       try{git('cat-file','-e',`${pr.head.sha}^{commit}`);}catch{git('fetch','--no-tags','origin',pr.head.sha);}
       git('merge-base','--is-ancestor',prior,pr.head.sha);
       if(!['documentation','ci-only'].includes(classify(changes(prior,pr.head.sha))))continue;
      }catch{continue;}
     }
     try{if(git('merge-tree','--write-tree',reference.base.sha,prior)!==git('rev-parse',`${prior}^{tree}`))continue;}catch{continue;}
     if(pr.merge_commit_sha===head){related=true;break;}
     try{git('merge-base','--is-ancestor',pr.merge_commit_sha,base);related=true;break;}catch{}
    }
   }
   if(!related)continue;
   const [a,b]=await Promise.all([candidate,companion].map(r=>request(`actions/runs/${r.id}/jobs?filter=latest&per_page=100`)));
   if(!successfulExecution(candidate,a.jobs??[],{repo,minimum:54})||!successfulExecution(companion,b.jobs??[],{repo,minimum:8}))continue;
   return {full:false,mode:clientDelta?'ui':'none',reason:clientDelta?'Client-only delta from a complete green baseline; fresh browser/build checks required':'Unchanged application/test inputs and full execution contracts; trusted complete green baseline',paths,provenance:{sourceCommit:prior,workflows:[{id:candidate.id,url:candidate.html_url},{id:companion.id,url:companion.html_url}]}};
  }
 }catch{return {full:true,mode:'full',reason:'No verifiable complete green baseline; broad checks required',paths};}
 return {full:true,mode:'full',reason:'Runtime, test, inventory, unknown, or unproven changes; broad checks required',paths};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=await select({event:JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),token:process.env.GH_TOKEN});
 console.log(JSON.stringify(result,null,2));
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(gatePlan(result.mode)).map(([key,value])=>`${key}=${value}\n`).join(''));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### CI Scope\n\n${result.reason}\n\n${result.provenance?`Reused original CI execution at ${result.provenance.sourceCommit}:\n\n${result.provenance.workflows.map(r=>`- [Run ${r.id}](${r.url})`).join('\n')}\n\nThis is prior-source evidence, not a new execution.`:'Selected checks execute normally; documentation checks always run.'}\n`);
}
