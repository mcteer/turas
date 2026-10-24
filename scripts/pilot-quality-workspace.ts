import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,lstat,symlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {featureSourceDigest} from './execution-source-digest';
import {staffingLiveSourceDigest} from './staffing-live-source';

/** Retain exact authored source and native artifact paths until independent
 * review. Never copy credentials, local state or generated dependency trees. */
export async function prepareQualityWorkspace(sourceRoot:string,workspace:string){
 await mkdir(workspace,{mode:0o700});
 const files=execFileSync('git',['ls-files','-z'],{cwd:sourceRoot,encoding:'utf8',maxBuffer:4194304}).split('\0').filter(Boolean);
 for(const file of files){
  if(file.startsWith('/')||file.split('/').includes('..')||/(^|\/)\.env(?:\.|$)/.test(file)&&file!=='.env.example'||/^(node_modules|\.eve|\.vercel|\.output|local-artifacts|tmp)\//.test(file))throw Error('Private or indirect review source denied');
  if(!(await lstat(join(sourceRoot,file))).isFile())throw Error('Regular authored review source required');
  const target=join(workspace,file);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(join(sourceRoot,file),target);
 }
 await symlink(resolve(sourceRoot,'node_modules'),join(workspace,'node_modules'));
 await symlink(resolve(sourceRoot,'packages/artifact-extractor/node_modules'),join(workspace,'packages/artifact-extractor/node_modules'));
 await verifyQualityWorkspace(sourceRoot,workspace);
}
export async function verifyQualityWorkspace(sourceRoot:string,workspace:string){
 for(const feature of ['008','010','011','014','016'] as const)if(await featureSourceDigest(feature,sourceRoot)!==await featureSourceDigest(feature,workspace))throw Error('Review workspace source differs');
 if(await staffingLiveSourceDigest(sourceRoot)!==await staffingLiveSourceDigest(workspace))throw Error('Staffing review source differs');
}
