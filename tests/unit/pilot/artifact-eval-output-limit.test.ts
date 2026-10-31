import {it,expect} from 'vitest';
import {wrapLanguageModel} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import {artifactEvalOutputMiddleware} from '../../../scripts/fixtures/artifact-eval-output-limit';
import {stageArtifactEvalAgent} from '../../../scripts/artifact-eval-environment';
import {mkdtemp,mkdir,symlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

for(const [name,requested,expected] of [
 ['caps an explicit larger artifact evaluation request',8192,1000],
 ['bounds an artifact evaluation request without a limit',undefined,1000],
 ['preserves a smaller artifact evaluation request',512,512],
] as const){
 it(name,async()=>{
  const stopped=new Error('Synthetic transport stop');
  const transport=new MockLanguageModelV4({doGenerate:async()=>{throw stopped;}});
  const model=wrapLanguageModel({model:transport,middleware:artifactEvalOutputMiddleware});
  const prompt=[{role:'user' as const,content:[{type:'text' as const,text:'Synthetic bounded request'}]}];
  const signal=new AbortController().signal;
  await expect(model.doGenerate({prompt,maxOutputTokens:requested,temperature:0.25,abortSignal:signal})).rejects.toBe(stopped);
  expect(transport.doGenerateCalls).toHaveLength(1);
  expect(transport.doGenerateCalls[0]).toMatchObject({maxOutputTokens:expected,temperature:0.25});
  expect(transport.doGenerateCalls[0].prompt).toBe(prompt);
  expect(transport.doGenerateCalls[0].abortSignal).toBe(signal);
 });
}

it('imports the staged artifact evaluation agent with its request limiter and root reasoning',async()=>{
 const base=resolve('local-artifacts/016');await mkdir(base,{recursive:true,mode:0o700});
 const app=await mkdtemp(join(base,'artifact-output-stage-'));
 try{
  await mkdir(join(app,'agent'));await symlink(resolve('node_modules'),join(app,'node_modules'));
  await stageArtifactEvalAgent(app);
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))};
  expect(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',
   'const fixture=await import(process.argv[1]);const root=await import(process.argv[2]);if(!fixture.default)throw Error("Staged fixture missing");if(root.default.reasoning!=="low"||fixture.default.reasoning!==root.default.reasoning)throw Error("Staged fixture lost root reasoning");process.stdout.write("staged");',
   pathToFileURL(join(app,'agent/agent.ts')).href,pathToFileURL(resolve('agent/agent.ts')).href],{cwd:app,env,encoding:'utf8',timeout:10000,maxBuffer:16384})).toBe('staged');
 }finally{await rm(app,{recursive:true,force:true});}
});
