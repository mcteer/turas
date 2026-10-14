import {spawnSync} from 'node:child_process';
import {z} from 'zod';
/** Docker --volumes removes anonymous volumes only. Named stores and bind mounts
 * are retained. Never remove a container whose actual ownership label differs. */
export function cleanupOwnedBackupContainer(container:string,owner:string){
 z.uuid().parse(owner);
 if(container!=='turas-016-pg-dump-'+owner&&container!=='turas-016-pg-restore-'+owner)throw Error('Exact owned backup container required');
 const inspected=spawnSync('docker',['inspect','--format','{{index .Config.Labels "turas.016.backup-owner"}}',container],{encoding:'utf8',timeout:10000});
 if(inspected.error)throw Error('Backup cleanup inspection unavailable');
 if(inspected.status!==0){
  if(/No such (?:object|container)/i.test(inspected.stderr??''))return 'already-absent' as const;
  throw Error('Backup cleanup inspection unavailable');
 }
 if(inspected.stdout.trim()!==owner)throw Error('Backup cleanup ownership differs');
 const removed=spawnSync('docker',['rm','--force','--volumes',container],{stdio:'ignore',timeout:10000});
 if(removed.error||removed.status!==0)throw Error('Backup cleanup unverified');
 return 'removed' as const;
}
