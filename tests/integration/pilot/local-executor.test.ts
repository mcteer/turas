import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {LocalJobExecutor} from '../../../lib/server/jobs/local-executor';
import {sha256} from '../../../lib/server/jobs/executor';
const exec=promisify(execFile);
// Opt-in actual local Docker proof. No selected DB, provider, or persistent store is used.
it('parses verified synthetic bytes in the pinned local image and removes its container',async()=>{
 const configured=process.env.TURAS_PILOT_LOCAL_PARSER_IMAGE;if(!configured)throw Error('Explicit local parser image required');
 const inspected=await exec('docker',['image','inspect',configured,'--format','{{.Id}}'],{timeout:5000});const image=inspected.stdout.trim(),digest=image.replace(/^sha256:/,'');
 const bytes=Buffer.from('Synthetic executor demonstration'),id=randomUUID();
 const assets=await mkdtemp(join(tmpdir(),'turas-executor-assets-'));try{
 const result=await new LocalJobExecutor({signaturesPath:assets,ocrAssetsPath:assets}).execute({id,kind:'artifact-parse',image,imageDigest:digest,deadlineAt:new Date(Date.now()+10000).toISOString(),inputs:[{name:'original',bytes,sizeBytes:bytes.length,digest:sha256(bytes)}],parser:{filename:'demonstration.txt',mime:'text/plain',scanReceiptDigest:'a'.repeat(64)}});
 expect(result.exitCode).toBe(0);const output=JSON.parse(result.stdout.toString());expect(output).toMatchObject({contract:'artifact-intake-v1',originalDigest:sha256(bytes),imageDigest:digest,status:'ready'});expect(output.units.map((unit:{text:string})=>unit.text).join(' ')).toContain('Synthetic executor demonstration');
 const remaining=await exec('docker',['ps','--all','--filter','label=turas.job.owner='+id,'--format','{{.ID}}'],{timeout:5000});expect(remaining.stdout.trim()).toBe('');
 }finally{await rm(assets,{recursive:true,force:true});}
},20000);
it('renders and validates actual PDF and native PPTX inside the pinned local image',async()=>{
 const configured=process.env.TURAS_PILOT_LOCAL_RENDERER_IMAGE;if(!configured)throw Error('Explicit local renderer image required');
 const inspected=await exec('docker',['image','inspect',configured,'--format','{{.Id}}'],{timeout:5000});const image=inspected.stdout.trim(),digest=image.slice(7);
 const {executiveArtifactFixtures}=await import('../../fixtures/reports/executive');const bytes=Buffer.from(JSON.stringify(executiveArtifactFixtures()[0].document)),id=randomUUID();
 const deadlineAt=new Date(Date.now()+120000).toISOString();const assets=await mkdtemp(join(tmpdir(),'turas-executor-assets-'));try{
  const result=await new LocalJobExecutor({signaturesPath:assets,ocrAssetsPath:assets}).execute({id,kind:'report-render',image,imageDigest:digest,deadlineAt,inputs:[{name:'report.json',bytes,sizeBytes:bytes.length,digest:sha256(bytes)}]});
  expect(result.exitCode).toBe(0);expect(result.files['report.pdf']?.subarray(0,5).toString()).toBe('%PDF-');expect(result.files['report.pptx']?.subarray(0,2).toString()).toBe('PK');
  const metadata=JSON.parse(result.files['renderer.json']!.toString()),checks=JSON.parse(result.files['checks.json']!.toString());expect(metadata.pdf.digest).toBe(sha256(result.files['report.pdf']!));expect(metadata.pptx.digest).toBe(sha256(result.files['report.pptx']!));expect(checks).toMatchObject({approvedEmbeddedFonts:true});expect(checks.pages).toBeGreaterThan(0);expect(checks.slides).toBeGreaterThan(0);
  const presentation=result.files['report.pptx']!,office=await new LocalJobExecutor({signaturesPath:assets,ocrAssetsPath:assets}).execute({id:randomUUID(),kind:'report-office-check',image,imageDigest:digest,deadlineAt,inputs:[{name:'report.pptx',bytes:presentation,sizeBytes:presentation.length,digest:sha256(presentation)}]});expect(office.exitCode).toBe(0);expect(JSON.parse(office.files['checks.json']!.toString()).nativeSaveReopen).toMatchObject({text:true,table:true});
  expect((await exec('docker',['ps','--all','--filter','label=turas.job.owner='+id,'--format','{{.ID}}'],{timeout:5000})).stdout.trim()).toBe('');
 }finally{await rm(assets,{recursive:true,force:true});}
},135000);
