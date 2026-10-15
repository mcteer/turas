import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {artifactFileTypes} from '../lib/contracts/artifact-file-types.ts';
import {validateArtifactExtraction} from '../lib/server/artifacts/extraction.ts';
import {artifactContainerInvocation} from '../lib/server/artifacts/containers.ts';
import {documentArchive,openDocument,epubDocument} from '../tests/fixtures/document-archive.ts';

const builder='turas-parity-parser-owned-'+process.pid,image=builder+':local';
const directory=mkdtempSync(join(tmpdir(),'turas-parity-parser-owned-'));
let created=false,built=false,container;
function docker(args,options={}){
 const result=spawnSync('docker',args,{encoding:'utf8',maxBuffer:8*1024*1024,...options});
 if(result.status!==0)throw Error('Owned parser check failed: '+args[0]);return result.stdout;
}
try{
 const context=JSON.parse(docker(['context','inspect']));
 if(!context[0]?.Endpoints?.docker?.Host?.startsWith('unix://') || process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))throw Error('A local Docker socket is required');
 docker(['buildx','create','--name',builder,'--driver','docker-container']);created=true;
 docker(['buildx','build','--builder',builder,'--load','--file','infra/artifacts/parser.Dockerfile','--tag',image,'.']);built=true;
 const imageDigest=docker(['image','inspect',image,'--format','{{.Id}}']).trim().replace(/^sha256:/,'');
 const text='Synthetic delivery evidence';
 const files=[{extension:'json',bytes:Buffer.from(JSON.stringify({evidence:text}))},
  ...['yaml','yml','xml','log'].map(extension=>({extension,bytes:Buffer.from(text)})),
  {extension:'html',bytes:Buffer.from('<p>'+text+'</p><img src="https://example.invalid/no-network"/>')},
  {extension:'rtf',bytes:Buffer.from('{\\rtf1 '+text+'}')},
  ...['odt','ods','odp','odg'].map(extension=>({extension,bytes:documentArchive(openDocument(extension))})),
  {extension:'epub',bytes:documentArchive(epubDocument())}];
 for(const file of files){
  const input=join(directory,'input');writeFileSync(input,file.bytes,{mode:0o444});
  const originalDigest=createHash('sha256').update(file.bytes).digest('hex');
  const scan={contract:'artifact-intake-v1',originalDigest,engineVersion:'synthetic',signatureVersion:'synthetic',scanPolicyVersion:'004-v1',scannedAt:new Date().toISOString(),result:'clean'};
  const scanReceiptDigest=createHash('sha256').update(JSON.stringify(scan)).digest('hex');
  const invocation=artifactContainerInvocation({kind:'parse',image:'turas-artifact-parser:004-v1',originalPath:input,ocrAssetsPath:directory});
  container=invocation.name;invocation.args[invocation.args.length-1]=image;
  const output=docker([...invocation.args,'/input','synthetic.'+file.extension,artifactFileTypes[file.extension],imageDigest,scanReceiptDigest,'-'],{timeout:90000});
  const manifest=validateArtifactExtraction(JSON.parse(output),{originalDigest,imageDigest,scanReceipt:scan});
  if(!manifest.units.some(unit=>unit.text.includes(text)))throw Error('Owned parser output is missing synthetic evidence');
  container=undefined;rmSync(input);
 }
 console.log(JSON.stringify({kind:'isolated-legacy-document-parser',formats:files.length,network:'none',releaseImageConfigured:false,passed:true}));
}finally{
 if(container)spawnSync('docker',['rm','-f',container],{stdio:'ignore'});
 let cleanupFailed=false;
 if(built&&spawnSync('docker',['image','rm',image],{stdio:'ignore'}).status!==0)cleanupFailed=true;
 if(created&&spawnSync('docker',['buildx','rm',builder],{stdio:'ignore'}).status!==0)cleanupFailed=true;
 rmSync(directory,{recursive:true,force:true});
 if(cleanupFailed)throw Error('Owned parser build cleanup failed');
}
