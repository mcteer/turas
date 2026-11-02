import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

// Metadata only: sensitive password values are never downloaded or printed.
const project=JSON.parse(await readFile('.vercel/project.json','utf8'));
const authPath=process.env.TURAS_VERCEL_AUTH_FILE??join(homedir(),process.platform==='darwin'?'Library/Application Support/com.vercel.cli/auth.json':'.local/share/com.vercel.cli/auth.json');
const token=process.env.VERCEL_TOKEN??JSON.parse(await readFile(authPath,'utf8')).token;
if(!project.projectId||!project.orgId||typeof token!=='string'||!token)throw Error('Linked project and operator authentication required');
const response=await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project.projectId)}/env?teamId=${encodeURIComponent(project.orgId)}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Preview credential metadata unavailable');
const {envs}=await response.json();
const records=envs.filter(entry=>entry.key==='TURAS_DEMO_PASSWORD');
const production=records.filter(entry=>!entry.gitBranch&&entry.target?.includes('production'));
if(production.length!==1||production[0].type!=='sensitive'||!production[0].target.includes('preview')||records.some(entry=>entry.id!==production[0].id&&entry.target?.includes('preview')))
 throw Error('Previews must inherit the existing Production mcteer credential record without overrides');
console.log(JSON.stringify({previewUsesProductionCredential:true,previewOverrides:0,secretValuesRead:false}));
