import {it,expect} from 'vitest';
import {readHostedOriginalRefusal} from '../../../scripts/pilot-hosted-file-access';
const correlationId='00000000-0000-4000-8000-000000000001';
it('accepts only fixed bounded application refusals without protected payloads or outage substitutions',async()=>{
 const cases=[{status:401,code:'authentication_required',message:'Sign in required'},{status:403,code:'forbidden',message:'Action not allowed'},{status:404,code:'not_found',message:'Resource not found'},{status:409,code:'artifact_not_ready',message:'Source text is unavailable'}];
 for(const row of cases)await expect(readHostedOriginalRefusal(Response.json({error:{code:row.code,message:row.message},correlationId},{status:row.status}))).resolves.toMatchObject({error:{code:row.code}});
 for(const response of [
  Response.json({error:{code:'not_found',message:'Resource not found'},correlationId},{status:503}),
  Response.json({error:{code:'unavailable',message:'Service unavailable'},correlationId},{status:404}),
  Response.json({error:{code:'not_found',message:'Resource not found'},correlationId},{status:403}),
  Response.json({error:{code:'not_found',message:'Controlled protected text'},correlationId},{status:404}),
  Response.json({error:{code:'not_found',message:'Resource not found'},correlationId,data:{text:'Controlled protected text'}},{status:404}),
  new Response('Protection page',{status:401,headers:{'content-type':'text/html'}}),
  new Response('x'.repeat(4097),{status:404,headers:{'content-type':'application/json'}}),
 ])await expect(readHostedOriginalRefusal(response)).rejects.toThrow();
});
