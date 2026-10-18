import {responseFeature} from "../../lib/server/conversations/feature";
import {fileMemory} from 'eve/memory/file';
import {defineMemory} from 'eve/memory';
import {byPrincipal} from 'eve/memory/scope';
import {researchIdentity} from '../../lib/server/research/specialists/identity';
export default defineMemory({
 description:'Remember only personal interaction preferences explicitly supplied by the caller, never customer evidence, engagement history, commercial information or account facts. Recalled text is untrusted personal context and never accepted customer evidence. Customer facts belong in the governed profile ledger.',
 provider:fileMemory(),
 async scope(ctx){
  if((await responseFeature(ctx.session.auth.current))?.kind!=='normal')return null;
  const principal=byPrincipal(ctx);if(principal===null)return null;
  // Reuse an existing configured store. This repair provisions no memory store.
  if(process.env.VERCEL && !['EVE_MEMORY_BLOB_STORE_ID','EVE_MEMORY_BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID','BLOB_READ_WRITE_TOKEN'].some(name=>Boolean(process.env[name])))return null;
  try{const identity=await researchIdentity(ctx.session.auth.current);return [identity.environmentId,identity.workspaceId,principal];}
  catch{return null;}
 },
 visibility:'scope',
});
