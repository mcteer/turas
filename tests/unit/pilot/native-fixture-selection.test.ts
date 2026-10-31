import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
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
 try{await mkdir(join(app,'agent'),{recursive:true});const source=await readFile(resolve('agent/agent.ts'),'utf8');await writeFile(join(app,'agent/agent.ts'),source,{mode:0o600});vi.stubEnv('DATABASE_URL','postgresql://synthetic@127.0.0.1/turas_fixture_native');vi.stubEnv('TURAS_ALLOW_LIVE_MODEL_TESTS','0');await run(app,source);}finally{await rm(root,{recursive:true,force:true});}
}
for(const row of installers)it(`preserves the routed guarded model and explicit context window in the actual ${row.name} installer`,async()=>copiedSource(row,async(app)=>{
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('Real network forbidden');});
 await row.install({appRoot:app,databaseName:'turas_fixture_native'} as never);expect(row.guard).toHaveBeenCalled();
 const generated=await readFile(join(app,'agent/agent.ts'),'utf8'),prefix='return { ...selectTurasGatewayModel(wrapStaffingModel('+row.creator+'(';
 expect(generated.split(prefix)).toHaveLength(2);const start=generated.indexOf(prefix),metadata=generated.indexOf('modelContextWindowTokens:',start),end=generated.indexOf('};',metadata);expect(metadata).toBeGreaterThan(start);expect(end).toBeGreaterThan(metadata);
 const expression=generated.slice(start+'return '.length,end+1);
 const underlying={syntheticProvider:true},wrapped={guarded:true},principal={principalId:'synthetic'},identity={stepIndex:0};
 const factory=vi.fn(()=>underlying),guard=vi.fn(()=>wrapped),release=vi.fn();
 const selection=Function('selectTurasGatewayModel','wrapStaffingModel',row.creator,'principal','identity','admitted','assertGovernedStaffingProviderRelease','return '+expression+';')(selectTurasGatewayModel,guard,factory,principal,identity,{mode:row.name},release);
 expect(factory).toHaveBeenCalledWith(principal,identity);expect(guard).toHaveBeenCalledWith(underlying,row.name,{deadlineAt:undefined,beforeProvider:expect.any(Function)});
 expect(selection).toEqual({model:wrapped,modelOptions:{providerOptions:{gateway:{only:['anthropic']}}},modelContextWindowTokens:128000});expect(selection.model).toBe(wrapped);expect(network).not.toHaveBeenCalled();
}));
it('keeps all five actual installer metadata guards fail closed before fixture writes when the source shape changes',async()=>{
 for(const row of installers)await copiedSource(row,async(app,source)=>{const changed=source.replace('beforeProvider: () => assertGovernedStaffingProviderRelease(principal, identity),','beforeProvider: () => { throw Error("Changed fixture shape"); },');await writeFile(join(app,'agent/agent.ts'),changed,{mode:0o600});await expect(row.install({appRoot:app,databaseName:'turas_fixture_native'} as never)).rejects.toThrow(/metadata/);expect(await readFile(join(app,'agent/agent.ts'),'utf8')).toBe(changed);});
 expect(controls.query).not.toHaveBeenCalled();
});
