import {describe,it,expect,vi} from 'vitest';
import {freezeReportMail,sendReportMail,verifyReportSenderDomain,retrieveReportMail} from '../../lib/server/reports/resend';
import {createHash} from 'node:crypto';
const mail=()=>freezeReportMail({from:'reports@example.com',to:'reviewer@example.net',subject:'Synthetic Weekly Report',html:'<p>Approved</p>',text:'Approved',attachments:[]});
describe('bounded report provider boundary',()=>{
 it('sends exactly the frozen bytes once, with the durable key and official endpoint',async()=>{
  const frozen=mail(),calls:Array<{url:string;options:RequestInit}>=[];
  const fetcher=vi.fn(async(url:string,options:RequestInit)=>{calls.push({url,options});return new Response(JSON.stringify({id:'339aa48a-44cd-4711-8d7e-7e53a7eb5460'}));});
  expect(await sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:frozen.bytes,payloadDigest:frozen.digest},fetcher)).toEqual({kind:'provider_accepted',messageId:'339aa48a-44cd-4711-8d7e-7e53a7eb5460'});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(calls[0].url).toBe('https://api.resend.com/emails');
  expect(calls[0].options.body).toBe(frozen.bytes.toString('utf8'));
  expect(new Headers(calls[0].options.headers).get('Idempotency-Key')).toBe('458f870a-e686-4a7f-b703-814d0375d991');
  expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
 });
 it.each([400,401,403,422])('classifies definitive HTTP %s as permanent without printing provider content',async status=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{}),frozen=mail();
  try{expect(await sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:frozen.bytes,payloadDigest:frozen.digest},async()=>new Response(JSON.stringify({name:'validation_error',message:'private@example.net'}),{status}))).toEqual({kind:'permanent_failure',code:'provider_rejected'});expect(log).not.toHaveBeenCalled();}finally{log.mockRestore();}
 });
 it('bounds provider retry advice, with no SDK retry',async()=>{
  const frozen=mail(),fetcher=vi.fn(async()=>new Response('{}',{status:429,headers:{'Retry-After':'999999'}}));
  expect(await sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:frozen.bytes,payloadDigest:frozen.digest},fetcher)).toEqual({kind:'retryable_failure',code:'provider_rate_limit',retryAfterSeconds:3600});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each([500,502,503,409])('keeps ambiguous HTTP %s uncertain',async status=>{
  const frozen=mail();expect((await sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:frozen.bytes,payloadDigest:frozen.digest},async()=>new Response('{}',{status}))).kind).toBe('uncertain');
 });
 it('keeps a lost acknowledgement uncertain without a hidden retry',async()=>{
  const frozen=mail(),fetcher=vi.fn(async()=>{throw new Error('private socket detail');});
  expect(await sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:frozen.bytes,payloadDigest:frozen.digest},fetcher)).toEqual({kind:'uncertain',code:'provider_outcome_unknown'});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('rejects altered frozen bytes and recipient expansion before a network call',async()=>{
  const frozen=mail(),fetcher=vi.fn();await expect(sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:Buffer.from('{}'),payloadDigest:frozen.digest},fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  const expanded=Buffer.from(JSON.stringify({from:'reports@example.com',to:['a@example.com','b@example.com'],subject:'Invalid',html:'x',text:'x'}));await expect(sendReportMail({apiKey:'synthetic-test-key',providerKey:'458f870a-e686-4a7f-b703-814d0375d991',requestBytes:expanded,payloadDigest:createHash('sha256').update(expanded).digest('hex')},fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 });
 it('embeds attachment content without provider-fetched URLs',()=>{
  const frozen=freezeReportMail({from:'reports@example.com',to:'reviewer@example.net',subject:'Synthetic Review',html:'x',text:'x',attachments:[{format:'pdf',bytes:Buffer.from('%PDF synthetic')}]}),request=JSON.parse(frozen.bytes.toString());
  expect(request.attachments[0]).toEqual({filename:'executive-report.pdf',content_type:'application/pdf',content:Buffer.from('%PDF synthetic').toString('base64')});expect(request.attachments[0].path).toBeUndefined();
 });
 it('binds read-only reconciliation to the opaque delivery tag and exact original mail',async()=>{
  const deliveryId='9f10b1ac-b6b4-42fb-a140-4bbf195482d1',emailId='339aa48a-44cd-4711-8d7e-7e53a7eb5460';
  const frozen=freezeReportMail({from:'reports@example.com',to:'reviewer@example.net',subject:'Synthetic Review',html:'<p>Exact</p>',text:'Exact',attachments:[],deliveryId});
  const original=JSON.parse(frozen.bytes.toString());expect(original.tags).toEqual([{name:'turas_delivery',value:deliveryId}]);
  const response={id:emailId,from:original.from,to:original.to,subject:original.subject,html:original.html,text:original.text,tags:original.tags,last_event:'delivered',cc:null,bcc:null};
  const fetcher=vi.fn(async(_url:string,_options:RequestInit)=>new Response(JSON.stringify(response)));
  expect(await retrieveReportMail({apiKey:'synthetic-test-key',messageId:emailId,deliveryId,requestBytes:frozen.bytes,payloadDigest:frozen.digest},fetcher)).toEqual({messageId:emailId,evidence:'delivered'});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].method).toBe('GET');
  for(const changed of [{tags:[]},{to:['other@example.net']},{html:'Changed'},{cc:['extra@example.net']}])await expect(retrieveReportMail({apiKey:'synthetic-test-key',messageId:emailId,deliveryId,requestBytes:frozen.bytes,payloadDigest:frozen.digest},async()=>new Response(JSON.stringify({...response,...changed})))).rejects.toMatchObject({code:'provider_evidence_mismatch'});
 });
 it('requires a matching verified sending domain with both tracking features explicitly disabled',async()=>{
  const input={apiKey:'synthetic-test-key',domainId:'339aa48a-44cd-4711-8d7e-7e53a7eb5460',senderAddress:'reports@example.com'},proof={id:input.domainId,name:'example.com',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false,records:[{private:'ignored DNS metadata'}]};
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(proof)));expect(await verifyReportSenderDomain(input,fetcher)).toEqual({domainId:input.domainId,domain:'example.com',openTracking:false,clickTracking:false});expect(fetcher).toHaveBeenCalledTimes(1);
  for(const changed of [{click_tracking:true},{open_tracking:true},{status:'pending'},{name:'other.example.com'},{capabilities:{sending:'disabled'}}])await expect(verifyReportSenderDomain(input,async()=>new Response(JSON.stringify({...proof,...changed})))).rejects.toMatchObject({code:'sender_unavailable'});
 });
});
