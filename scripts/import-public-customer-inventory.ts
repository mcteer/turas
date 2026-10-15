import {readFile,lstat,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {getCurrentSession} from '../lib/server/auth/sessions';
import {importPublicCustomerInventory} from '../lib/server/profiles/public-inventory';
import {query,closeRuntimePool} from '../lib/server/db/client';

/** Release backfill only. No embedded customer data, credentials, customer
 * creation, provider calls, schema changes or human-claim approvals. */
const args=process.argv.slice(2),options:Record<string,string>={};
for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!['source','cookie-file','environment','receipt'].includes(key)||options[key]||!args[i+1])throw Error('Explicit source, cookie-file, environment and private receipt paths are required');options[key]=args[i+1];}
if(Object.keys(options).length!==4||options.environment!==process.env.TURAS_ENVIRONMENT_ID)throw Error('Explicit matching target environment required');
try{
 const marker=await query<{environment_id:string}>('SELECT environment_id FROM turas_environment');
 if(marker.rowCount!==1||marker.rows[0].environment_id!==options.environment)throw Error('Inventory target environment mismatch');
 const cookiePath=resolve(options['cookie-file']),cookieStat=await lstat(cookiePath);
 if(!cookieStat.isFile()||cookieStat.isSymbolicLink()||(cookieStat.mode&0o777)!==0o600)throw Error('Private operator cookie file required');
 const receipt=resolve(options.receipt),parent=await lstat(dirname(receipt));
 if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o777)!==0o700)throw Error('Private receipt directory required');
 const source=resolve(options.source),sourceStat=await lstat(source);if(!sourceStat.isFile()||sourceStat.isSymbolicLink()||sourceStat.size>10*1024*1024)throw Error('Bounded public reference file required');
 const bytes=await readFile(source),actor=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:(await readFile(cookiePath,'utf8')).trim()}}));
 if(!actor)throw Error('Current authenticated operator session required');
 const result=await importPublicCustomerInventory(actor,JSON.parse(bytes.toString('utf8')));
 const record={kind:'public-customer-inventory-backfill',environmentId:options.environment,sourceSha256:createHash('sha256').update(bytes).digest('hex'),completedAt:new Date().toISOString(),providerCalls:0,...result};
 await writeFile(receipt,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(record));
}finally{await closeRuntimePool();}
