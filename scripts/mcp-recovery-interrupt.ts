import { withMcpEnvironment } from './mcp-environment';
/** IPC-only child owned by the recovery runner; never signal another process. */
if(!process.send||process.argv.length!==2)throw Error('Owned recovery IPC parent required');
try{
 await withMcpEnvironment(async environment=>{
  process.send!({appRoot:environment.appRoot,databaseName:environment.databaseName});
  await new Promise<never>((_,reject)=>environment.signal.addEventListener('abort',()=>reject(Error('Expected owned interruption')),{once:true}));
 });
 throw Error('Expected owned interruption did not happen');
}catch(error){if(!(error instanceof Error)||error.message!=='Expected owned interruption')throw error;}
