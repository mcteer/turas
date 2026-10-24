import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureUiChild} from '../../scripts/capture-ui-child';

it('drains a supervised sibling under log pressure while the UI child awaits its response',async()=>{
 const root=await mkdtemp(join(tmpdir(),'turas-ui-pressure-')),ready=join(root,'ready');
 const sibling=spawn(process.execPath,['-e',"const fs=require('node:fs');process.stdout.write(Buffer.alloc(4*1024*1024),()=>fs.writeFileSync(process.argv[1],'ready'));",ready],{stdio:['ignore','pipe','ignore']});
 let bytes=0;sibling.stdout.on('data',chunk=>{bytes+=chunk.length;});
 try{
  const result=await captureUiChild(['-e',"const fs=require('node:fs');const t=setInterval(()=>{if(fs.existsSync(process.argv[1])){clearInterval(t);process.stdout.write('response received');}},10);",ready],{env:process.env,timeout:5000});
  expect(result).toMatchObject({status:0,error:false,stdout:'response received'});expect(bytes).toBe(4*1024*1024);
 }finally{sibling.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
});

it('enforces a finite UI deadline and terminates an unresponsive descendant process group',async()=>{
 const root=await mkdtemp(join(tmpdir(),'turas-ui-deadline-')),pidFile=join(root,'pid');
 try{
  const descendant="require('node:fs').writeFileSync(process.argv[1],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";
  const script="process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'inherit'});setInterval(()=>{},1000);";
  const result=await captureUiChild(['-e',script,descendant,pidFile],{env:process.env,timeout:500});
  expect(result.error).toBe(true);expect(result.status).not.toBe(0);
  const pid=Number(await readFile(pidFile,'utf8'));expect(Number.isSafeInteger(pid)).toBe(true);
  // Descendants can briefly remain as zombies until the platform reaps them.
  const state=await new Promise<string>(resolve=>{const p=spawn('ps',['-o','stat=','-p',String(pid)]);let out='';p.stdout.on('data',b=>out+=b);p.on('close',()=>resolve(out.trim()));});
  expect(state===''||state.startsWith('Z')).toBe(true);
 }finally{await rm(root,{recursive:true,force:true});}
});

it('bounds combined UI stdout and stderr without retaining excess bytes',async()=>{
 const result=await captureUiChild(['-e',"process.stdout.write(Buffer.alloc(300000));process.stderr.write(Buffer.alloc(300000));setInterval(()=>{},1000);"],{env:process.env,timeout:5000,maximumBytes:100000});
 expect(result.error).toBe(true);expect(result.status).not.toBe(0);expect(Buffer.byteLength(result.stdout)+Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(100000);
});
