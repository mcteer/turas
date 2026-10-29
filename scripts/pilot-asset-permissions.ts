import {chmod,lstat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
/** CLI harness only: public, verified AV/OCR assets; never private objects. */
export async function preparePilotAssetPermissions(storeRoot:string){
 const entries:string[]=[];
 for(const directory of ['signatures','assets']){
  const root=join(storeRoot,directory),info=await lstat(root);
  if(!info.isDirectory()||info.isSymbolicLink())throw Error('Unsafe owned public asset directory');
  for(const name of await readdir(root)){
   if(directory==='signatures'&&name==='freshclam.dat')continue;
   if(directory==='signatures'?!/^(main|daily|bytecode)(?:\.(?:cvd|cld)|-\d+\.cvd\.sign)$/.test(name):name!=='eng.traineddata')throw Error('Unexpected public execution asset');
   const file=join(root,name),stat=await lstat(file);
   if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe owned public execution asset');
   entries.push(file);
  }
 }
 // Recursive cp's mkdir is subject to the runner's deliberate private umask.
 // Fixed scanner/parser UIDs must read these public assets, not private data.
 for(const file of entries)await chmod(file,0o644);
 for(const directory of ['signatures','assets'])await chmod(join(storeRoot,directory),0o755);
}
