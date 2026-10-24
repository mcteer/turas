import {it,expect,vi,beforeEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import {requireEvaluationSourceDatabase} from '../../../scripts/eval-source-database';
vi.mock('node:child_process',async()=>({...await vi.importActual<typeof import('node:child_process')>('node:child_process'),spawnSync:vi.fn()}));
const token='abcdef012345',owner=`postgresql://postgres:synthetic@127.0.0.1:34567/turas_test_016_eval_${token}`;
const environment={NODE_ENV:'test' as const,DATABASE_URL:owner.replace('postgres:synthetic@','turas_runtime:synthetic@'),DATABASE_URL_UNPOOLED:owner,TURAS_TEST_DATABASE_URL:owner,TURAS_PILOT_OWNED:'1',TURAS_ENVIRONMENT_ID:'test-pilot-'+token,TURAS_TEST_ENVIRONMENT_ID:'test-pilot-'+token,TURAS_TEST_POSTGRES_CONTAINER:'turas-016-check-'+token};
const metadata=()=>({Name:'/'+environment.TURAS_TEST_POSTGRES_CONTAINER,Config:{Labels:{'turas.016.owner':token}},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'34567'}]}}});
function inspect(value:unknown,status=0){vi.mocked(spawnSync).mockReturnValue({pid:1,status,signal:null,output:[],stdout:JSON.stringify(value),stderr:''} as unknown as ReturnType<typeof spawnSync>);}
beforeEach(()=>vi.mocked(spawnSync).mockReset());
it('preserves ordinary separated test database selection without inspecting containers',()=>{
 const url='postgresql://owner:synthetic@127.0.0.1:34567/turas_test_005_example';expect(requireEvaluationSourceDatabase({NODE_ENV:'test',DATABASE_URL:'postgresql://runtime:synthetic@127.0.0.1:34567/application',TURAS_TEST_DATABASE_URL:url,TURAS_TEST_ENVIRONMENT_ID:'test-example'})).toBe(url);expect(spawnSync).not.toHaveBeenCalled();
});
it('accepts only the actual owned pilot endpoint with a distinct runtime login',()=>{
 inspect([metadata()]);expect(requireEvaluationSourceDatabase(environment)).toBe(owner);expect(spawnSync).toHaveBeenCalledWith('docker',['inspect',environment.TURAS_TEST_POSTGRES_CONTAINER],expect.objectContaining({timeout:5000}));
});
it('rejects hosted unmarked mismatched and owner-as-runtime sources before inspection',()=>{
 for(const patch of [{TURAS_PILOT_OWNED:'0'},{DATABASE_URL:owner},{DATABASE_URL:environment.DATABASE_URL.replace('34567','34568')},{DATABASE_URL_UNPOOLED:owner.replace('127.0.0.1','ep-other.neon.tech')},{TURAS_TEST_DATABASE_URL:owner+'other'},{TURAS_TEST_ENVIRONMENT_ID:'test-other'},{TURAS_TEST_POSTGRES_CONTAINER:'foreign-container'}])expect(()=>requireEvaluationSourceDatabase({...environment,...patch})).toThrow();expect(spawnSync).not.toHaveBeenCalled();
});
it('rejects missing containers foreign labels and mismatched actual port bindings',()=>{
 const wrongLabel=metadata();wrongLabel.Config.Labels['turas.016.owner']='foreign';const wrongPort=metadata();wrongPort.NetworkSettings.Ports['5432/tcp'][0].HostPort='34568';const publicPort=metadata();publicPort.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0';
 for(const value of [[],[metadata(),metadata()],[wrongLabel],[wrongPort],[publicPort],[{...metadata(),Name:'/foreign'}]]){inspect(value);expect(()=>requireEvaluationSourceDatabase(environment)).toThrow();}inspect([metadata()],1);expect(()=>requireEvaluationSourceDatabase(environment)).toThrow();
});

it('keeps nested owned Next copies within their actual linked dependency root',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,symlink,rm}=await import('node:fs/promises'),{join,resolve}=await import('node:path');
 const {configureOwnedNextDependencyRoot}=await import('../../../scripts/owned-next-config');
 const root=await mkdtemp(resolve('local-artifacts/016/owned-next-root-'));
 try{const app=join(root,'nested/app'),dependencies=join(root,'dependencies');await mkdir(join(app,'packages/artifact-extractor'),{recursive:true});await mkdir(dependencies);await symlink(dependencies,join(app,'node_modules'));await symlink(dependencies,join(app,'packages/artifact-extractor/node_modules'));
 const file=join(app,'next.config.ts'),authored="const nextConfig = {turbopack:{rules:{}},serverExternalPackages:['retained']};\nexport default withEve(nextConfig);\n";await writeFile(file,authored);
 expect(await configureOwnedNextDependencyRoot(app)).toBe(root);await configureOwnedNextDependencyRoot(app);const configured=await readFile(file,'utf8');expect(configured.match(/owned-next-dependency-root-v1/g)).toHaveLength(1);expect(configured).toContain("serverExternalPackages:['retained']");expect(configured).toContain('...nextConfig.turbopack');expect(configured).toContain(JSON.stringify(root));
 await writeFile(file,'unsupported config');await expect(configureOwnedNextDependencyRoot(app)).rejects.toThrow('shape changed');expect(await readFile(file,'utf8')).toBe('unsupported config');
 }finally{await rm(root,{recursive:true,force:true});}
});
