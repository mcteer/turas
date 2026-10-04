import {randomUUID,createHmac,randomBytes} from 'node:crypto';
import {describe,it,expect,afterEach} from 'vitest';
import {verifyReportWebhook} from '../../lib/server/reports/webhooks';
const saved=process.env.RESEND_WEBHOOK_SECRET;
afterEach(()=>{if(saved===undefined)delete process.env.RESEND_WEBHOOK_SECRET;else process.env.RESEND_WEBHOOK_SECRET=saved;});
function signed(body:string,offsetSeconds=0){
 const key=randomBytes(32),id='msg_'+randomUUID(),timestamp=String(Math.floor(Date.now()/1000)+offsetSeconds);
 process.env.RESEND_WEBHOOK_SECRET='whsec_'+key.toString('base64');
 const signature=createHmac('sha256',key).update(`${id}.${timestamp}.${body}`).digest('base64');
 return new Request('http://localhost/api/reports/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature},body});
}
function receipt(){return JSON.stringify({type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:randomUUID(),from:'sender@example.invalid',to:['recipient@example.invalid'],subject:'Synthetic Approved Report',tags:{turas_delivery:randomUUID()}}});}
describe('signed raw provider receipt boundary',()=>{
 it('verifies the exact raw body through the official SDK',async()=>{
  const body=receipt(),verified=await verifyReportWebhook(signed(body));expect(verified?.event.type).toBe('email.delivered');
 });
 it('rejects changed bytes, expired signatures, missing headers and oversized signed bodies',async()=>{
  const original=signed(receipt()),changed=new Request(original.url,{method:'POST',headers:original.headers,body:receipt()});
  await expect(verifyReportWebhook(changed)).rejects.toMatchObject({status:401});
  await expect(verifyReportWebhook(signed(receipt(),-601))).rejects.toMatchObject({status:401});
  await expect(verifyReportWebhook(new Request(original.url,{method:'POST',body:receipt()}))).rejects.toMatchObject({status:401});
   await expect(verifyReportWebhook(signed('x'.repeat(262145)))).rejects.toMatchObject({status:413});
 });
  it('acknowledges signed unrelated types and rejects malformed governed receipts',async()=>{
  expect(await verifyReportWebhook(signed(JSON.stringify({type:'email.opened',private:'unretained'})))).toBeNull();
  await expect(verifyReportWebhook(signed(JSON.stringify({type:'email.delivered',data:{}})))).rejects.toMatchObject({status:422});
  });
  it('accepts bounded provider metadata above the ordinary JSON command limit',async()=>{
   const body=JSON.stringify({...JSON.parse(receipt()),provider_metadata:'x'.repeat(140000)});
   const verified=await verifyReportWebhook(signed(body));
   expect(verified?.event.type).toBe('email.delivered');
   expect(verified?.event).not.toHaveProperty('provider_metadata');
  });
});
