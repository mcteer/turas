import {it,expect} from 'vitest';
import {mkdtemp,cp,rm,writeFile,readFile,symlink,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {recordWorkBackupFailure,workBackupFailureDiagnostic} from '../../../lib/server/operations/work-backup-diagnostics';
import {verifyNativePostgresClient} from '../../../lib/server/operations/native-postgres';

const assets=resolve('infra/pilot/native-postgres/linux-amd64');
async function fixture(run:(root:string)=>Promise<void>){
 const parent=await mkdtemp(resolve('local-artifacts/016/native-assets-test-')),root=join(parent,'client');
 try{await cp(assets,root,{recursive:true});await run(root);}finally{await rm(parent,{recursive:true,force:true});}
}
it('verifies every licensed native client byte against the fixed inventory',async()=>{
 expect(await verifyNativePostgresClient(assets)).toMatchObject({clientMajor:18,sourceDigest:'555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f'});
});
it('rejects modified executable bytes before native execution',async()=>fixture(async root=>{
 await writeFile(join(root,'bin/pg_dump'),'changed');const failure=await verifyNativePostgresClient(root).catch(error=>error);expect(failure).toBeInstanceOf(Error);expect(failure.message).toContain('bytes differ');recordWorkBackupFailure(failure,'capture');expect(workBackupFailureDiagnostic(failure)).toEqual({stage:'capture-native-assets',code:'unclassified',reason:'native-assets'});
}));
it('rejects unlisted libraries and writable library directories',async()=>fixture(async root=>{
 const path=join(root,'lib/hostile.so');await writeFile(path,'unlisted');await expect(verifyNativePostgresClient(root)).rejects.toThrow('Unlisted');await rm(path);
 await chmod(join(root,'lib'),0o777);await expect(verifyNativePostgresClient(root)).rejects.toThrow('Immutable');
}));
it('rejects symbolic executable aliases and indirect client roots',async()=>fixture(async root=>{
 const path=join(root,'lib/libpq.so.5');await rm(path);await symlink('libpq.so.5.18',path);await expect(verifyNativePostgresClient(root)).rejects.toThrow('bytes differ');
 const alias=join(root,'..','alias');await symlink(root,alias);await expect(verifyNativePostgresClient(alias)).rejects.toThrow('Immutable');
}));
it('rejects a manifest that substitutes another executable or drops license provenance',async()=>fixture(async root=>{
 const path=join(root,'manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));manifest.files[0].path='bin/sh';await writeFile(path,JSON.stringify(manifest));await expect(verifyNativePostgresClient(root)).rejects.toThrow('Exact');
}));
