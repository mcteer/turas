import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {cleanupOwnedBackupContainer} from '../../../lib/server/operations/backup-container-cleanup';
import {recoveryPostgresImage} from '../../../lib/server/operations/postgres-version';
it('removes real PostgreSQL client anonymous volumes while retaining named volumes',()=>{
 for(const major of [17,18] as const){
  const owner=randomUUID(),container='turas-016-pg-dump-'+owner,named='turas-016-cleanup-retained-'+owner;let created=false;
  const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1048576});
  try{
   docker(['volume','create','--label','turas.016.backup-owner='+owner,named]);created=true;
   docker(['run','--pull=never','--name',container,'--label','turas.016.backup-owner='+owner,'--network=none','--read-only','--mount','type=volume,source='+named+',target=/retained','--entrypoint','sh',recoveryPostgresImage(major),'-c','true']);
   const mounts=JSON.parse(docker(['inspect',container]))[0].Mounts,anonymous=mounts.filter((m:{Type:string;Name:string})=>m.Type==='volume'&&m.Name!==named).map((m:{Name:string})=>m.Name);
   expect(anonymous.length).toBeGreaterThan(0);expect(cleanupOwnedBackupContainer(container,owner)).toBe('removed');
   for(const volume of anonymous){const absent=spawnSync('docker',['volume','inspect',volume],{encoding:'utf8',timeout:10000});expect(absent.status).not.toBe(0);expect(absent.stderr).toMatch(/no such volume/i);}
   expect(JSON.parse(docker(['volume','inspect',named]))[0].Labels['turas.016.backup-owner']).toBe(owner);
  }finally{
   cleanupOwnedBackupContainer(container,owner);
   if(created){const meta=JSON.parse(docker(['volume','inspect',named]))[0];if(meta.Labels['turas.016.backup-owner']!==owner)throw Error('Named test volume ownership differs');docker(['volume','rm',named]);}
  }
 }
},60000);
