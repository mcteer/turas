import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {selectTurasGatewayModel} from '../../../lib/server/models/gateway-routing';
const controls=vi.hoisted(()=>({query:vi.fn(async()=>({rows:[],rowCount:0})),staffing:vi.fn(),execution:vi.fn(),support:vi.fn(),expansion:vi.fn(),learning:vi.fn()}));
vi.mock('../../../lib/server/db/client',async original=>({...await original<typeof import('../../../lib/server/db/client')>(),query:controls.query}));
vi.mock('../../../scripts/staffing-eval-environment',async original=>({...await original<typeof import('../../../scripts/staffing-eval-environment')>(),requireOwnedStaffingClone:controls.staffing}));
vi.mock('../../../scripts/execution-eval-environment',async original=>({...await original<typeof import('../../../scripts/execution-eval-environment')>(),requireOwnedExecutionClone:controls.execution}));
vi.mock('../../../scripts/support-eval-environment',async original=>({...await original<typeof import('../../../scripts/support-eval-environment')>(),requireOwnedSupportClone:controls.support}));
vi.mock('../../../scripts/expansion-eval-environment',async original=>({...await original<typeof import('../../../scripts/expansion-eval-environment')>(),requireOwnedExpansionClone:controls.expansion}));
vi.mock('../../../scripts/learning-environment',async original=>({...await original<typeof import('../../../scripts/learning-environment')>(),requireOwnedLearningDatabase:controls.learning}));
vi.mock('../../fixtures/learning/environment',async original=>({...await original<typeof import('../../fixtures/learning/environment')>(),withLearningDatabase:async(run:(db:{query:typeof controls.query})=>Promise<unknown>)=>run({query:controls.query})}));
import {installStaffingNativeFixture} from '../../fixtures/staffing/native';
import {installExecutionNativeFixture} from '../../fixtures/execution/native';
import {installSupportNativeFixture} from '../../fixtures/support/native';
import {installExpansionNativeFixture} from '../../fixtures/expansion/native-install';
import {installLearningNativeFixture} from '../../fixtures/learning/native-install';
const installers=[
 {name:'staffing',feature:'007',prefix:'eval-',install:installStaffingNativeFixture,creator:'createStaffingNativeFixtureModel',guard:controls.staffing},
 {name:'execution',feature:'008',prefix:'eval-',install:installExecutionNativeFixture,creator:'createExecutionNativeFixtureModel',guard:controls.execution},
 {name:'support',feature:'010',prefix:'eval-',install:installSupportNativeFixture,creator:'createSupportNativeFixtureModel',guard:controls.support},
 {name:'expansion',feature:'011',prefix:'eval-',install:installExpansionNativeFixture,creator:'createExpansionNativeFixtureModel',guard:controls.expansion},
 {name:'learning',feature:'014',prefix:'owned-',install:installLearningNativeFixture,creator:'createLearningNativeFixtureModel',guard:controls.learning},
] as const;
const saved={ready:process.env.TURAS_LEARNING_NATIVE_FIXTURE_READY,cron:process.env.CRON_SECRET};
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.clearAllMocks();for(const [key,value]of [['TURAS_LEARNING_NATIVE_FIXTURE_READY',saved.ready],['CRON_SECRET',saved.cron]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
async function copiedSource(row:typeof installers[number],run:(app:string,source:string)=>Promise<void>){
 const base=resolve('local-artifacts',row.feature);await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,row.prefix)),app=join(root,'app');
 try{await mkdir(join(app,'agent'),{recursive:true});const source=await readFile(resolve('agent/agent.ts'),'utf8');await writeFile(join(app,'agent/agent.ts'),source,{mode:0o600});const databaseName=row.feature==='007'?'turas_test_007_eval_aaaaaaaaaaaa':'turas_fixture_native';
  vi.stubEnv('DATABASE_URL','postgresql://synthetic@127.0.0.1/'+databaseName);vi.stubEnv('TURAS_TEST_DATABASE_URL',process.env.DATABASE_URL!);
  vi.stubEnv('TURAS_ENVIRONMENT_ID','test-native-metadata');vi.stubEnv('TURAS_TEST_ENVIRONMENT_ID','test-native-metadata');
  vi.stubEnv('AI_GATEWAY_API_KEY','');vi.stubEnv('VERCEL_OIDC_TOKEN','');vi.stubEnv('TURAS_ALLOW_LIVE_MODEL_TESTS','0');
  if(row.feature==='007'){await mkdir(join(app,'scripts'));await copyFile(resolve('scripts/dev.mjs'),join(app,'scripts/dev.mjs'));}
  await run(app,source);}finally{await rm(root,{recursive:true,force:true});}
}
for(const row of installers)it(`preserves the routed guarded model and explicit context window in the actual ${row.name} installer`,async()=>copiedSource(row,async(app)=>{
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('Real network forbidden');});
 await row.install({appRoot:app,databaseName:new URL(process.env.DATABASE_URL!).pathname.slice(1)} as never);expect(row.guard).toHaveBeenCalled();
 const generated=await readFile(join(app,'agent/agent.ts'),'utf8'),prefix='return { ...selectTurasGatewayModel(deferModelAdmission(';
 expect(generated.split(prefix)).toHaveLength(2);const start=generated.indexOf(prefix),metadata=generated.indexOf('modelContextWindowTokens:',start),end=generated.indexOf('};',metadata);expect(metadata).toBeGreaterThan(start);expect(end).toBeGreaterThan(metadata);
 const expression=generated.slice(start+'return '.length,end+1);
 const underlying={syntheticProvider:true},wrapped={guarded:true},selected={deferred:true},principal={principalId:'synthetic'},identity={stepIndex:0};
 const factory=vi.fn(()=>underlying),guard=vi.fn(()=>wrapped),release=vi.fn(),admit=vi.fn(async()=>({mode:row.name}));
 let prepare!:(()=>Promise<unknown>);
 const defer=vi.fn((_model:unknown,run:()=>Promise<unknown>)=>{prepare=run;return selected;});
 const selection=Function('selectTurasGatewayModel','deferModelAdmission','parityBudgetModel','gateway','selectedModel','wrapStaffingModel',row.creator,'principal','identity','admitGovernedStaffingModelStep','assertGovernedStaffingProviderRelease','return '+expression+';')(selectTurasGatewayModel,defer,(model:unknown)=>model,()=>underlying,'anthropic/claude-sonnet-5.5',guard,factory,principal,identity,admit,release);
 expect(admit).not.toHaveBeenCalled();expect(factory).not.toHaveBeenCalled();
 expect(selection).toEqual({model:selected,modelOptions:{providerOptions:{gateway:{only:['anthropic']}}},modelContextWindowTokens:128000});
 expect(await prepare()).toBe(wrapped);expect(admit).toHaveBeenCalledWith(principal,identity);expect(factory).toHaveBeenCalledWith(principal,identity);expect(guard).toHaveBeenCalledWith(underlying,row.name,{deadlineAt:undefined,beforeProvider:expect.any(Function)});expect(network).not.toHaveBeenCalled();
}));
it('keeps all five actual installer metadata guards fail closed before fixture writes when the source shape changes',async()=>{
 for(const row of installers)await copiedSource(row,async(app,source)=>{const changed=source.replace('beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),','beforeProvider: () => { throw Error("Changed fixture shape"); },');await writeFile(join(app,'agent/agent.ts'),changed,{mode:0o600});await expect(row.install({appRoot:app,databaseName:new URL(process.env.DATABASE_URL!).pathname.slice(1)} as never)).rejects.toThrow(/metadata/);expect(await readFile(join(app,'agent/agent.ts'),'utf8')).toBe(changed);});
 expect(controls.query).not.toHaveBeenCalled();
});
const ordinaryInstallers=[
 ['files','check-ordinary-native-files.ts','createOrdinaryNativeFileFixtureModel'],
 ['operations','check-ordinary-operations-native.ts','createOrdinaryOperationsNativeModel'],
 ['questions','check-ordinary-questions-native.ts','createOrdinaryQuestionsNativeModel'],
 ['chat','check-ordinary-chat-native.ts','createOrdinaryNativeFixtureModel'],
] as const;
// Execute each actual authored preparation block, without starting its owned DB/browser.
async function runOrdinaryInstallerBlock(script:string,source:string){
 const authored=await readFile(resolve('scripts',script),'utf8');
 const targetStart=authored.indexOf("target='return ");expect(targetStart).toBeGreaterThan(0);
 const targetEnd=authored.indexOf('\n',targetStart),guardStart=authored.indexOf(' if(source.split(target)',targetEnd);
 const writeStart=authored.indexOf(' await writeFile(',guardStart),writeEnd=authored.indexOf('{mode:0o600});',writeStart)+'{mode:0o600});'.length;
 expect(guardStart).toBeGreaterThan(targetEnd);expect(writeStart).toBeGreaterThan(guardStart);expect(writeEnd).toBeGreaterThan(writeStart);
 const body='const '+authored.slice(targetStart,targetEnd)+'\n'+authored.slice(guardStart,writeEnd);
 const writes:Array<{path:string;source:string;options:{mode:number}}>=[];
 const run=Object.getPrototypeOf(async function(){}).constructor('source','path','modelPath','writeFile',body) as (source:string,path:string,modelPath:string,write:(path:string,source:string,options:{mode:number})=>Promise<void>)=>Promise<void>;
 await run(source,'owned-agent.ts','owned-agent.ts',async(path,source,options)=>{writes.push({path,source,options});});
 return writes;
}
for(const [name,script,creator]of ordinaryInstallers)it(`preserves routing and 128k metadata through the actual ordinary ${name} fixture preparation`,async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('Real network forbidden');});
 const source=await readFile(resolve('agent/agent.ts'),'utf8'),writes=await runOrdinaryInstallerBlock(script,source);expect(writes).toHaveLength(1);expect(writes[0].options.mode).toBe(0o600);
 const generated=writes[0].source,start=generated.indexOf('return {...selectTurasGatewayModel(wrapOrdinaryChatModel('+creator+'('),end=generated.indexOf('modelContextWindowTokens:128_000};',start)+'modelContextWindowTokens:128_000}'.length;
 expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
 const underlying={fixture:true},wrapped={guarded:true},principal={attributes:{turasAttemptId:'synthetic-attempt'}},ctx={session:{id:'synthetic-native'},messages:[]},event={type:'step.started'},factory=vi.fn((..._args:unknown[])=>underlying),guard=vi.fn(()=>wrapped);
 const selection=Function('selectTurasGatewayModel','wrapOrdinaryChatModel',creator,'principal','ctx','turnId','stepIndex','event','return '+generated.slice(start+'return '.length,end)+';')(selectTurasGatewayModel,guard,factory,principal,ctx,'turn_0',0,event);
 expect(factory.mock.calls[0]?.[0]).toBe('synthetic-attempt');expect(guard).toHaveBeenCalledWith(underlying,principal,'synthetic-native','turn_0');
 expect(selection).toEqual({model:wrapped,modelOptions:{providerOptions:{gateway:{only:['anthropic']}}},modelContextWindowTokens:128000});expect(selection.model).toBe(wrapped);expect(network).not.toHaveBeenCalled();
 const changed=source.replace('return selectTurasGatewayModel(wrapOrdinaryChatModel(', 'return changedOrdinaryModel(');
 await expect(runOrdinaryInstallerBlock(script,changed)).rejects.toThrow(/shape changed/i);
});
