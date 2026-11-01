import {afterEach,expect,it,vi} from 'vitest';
import {captureStaffingLiveStream} from '../../scripts/staffing-live-stream';
import {replyFixture} from '../fixtures/eve-v27';
const input=()=>({origin:'http://127.0.0.1:3123',cookie:'synthetic=owned',nativeSessionId:'wrun_synthetic',turnId:'turn_0',deadlineAt:Date.now()+60000,suiteDeadlineAt:Date.now()+120000});
const response=(body:string)=>new Response(body,{status:200,headers:{'content-type':'application/x-ndjson','x-eve-stream-version':'27'}});
afterEach(()=>vi.unstubAllGlobals());
it('reads actual v27 source lines by GET and stops at its exact terminal without sending',async()=>{
 const fetcher=vi.fn().mockResolvedValue(response(replyFixture().body));vi.stubGlobal('fetch',fetcher);
 const result=await captureStaffingLiveStream({...input(),startIndex:4});
 expect(result).toMatchObject({outcome:'terminal',terminal:'turn.completed',nextIndex:5});expect(result.events).toHaveLength(1);
 expect(fetcher).toHaveBeenCalledTimes(1);const [url,options]=fetcher.mock.calls[0];
 expect(new URL(String(url)).searchParams.get('startIndex')??'0').toBe('0');expect(options?.method??'GET').toBe('GET');
});
it('preserves UTF-8 across real stream chunk boundaries',async()=>{
 const bytes=new TextEncoder().encode(replyFixture('Kōrero').body),split=bytes.indexOf(0xc5)+1;
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,split));controller.enqueue(bytes.slice(split));controller.close();}}),{headers:{'content-type':'application/x-ndjson','x-eve-stream-version':'27'}})));
 expect(JSON.stringify((await captureStaffingLiveStream(input())).events)).toContain('Kōrero');
});
it('resumes a broken GET at its complete source cursor without another delivery',async()=>{
 const lines=replyFixture().body.trim().split('\n');
 const fetcher=vi.fn().mockResolvedValueOnce(response(lines.slice(0,3).join('\n')+'\n')).mockResolvedValueOnce(response(lines.slice(3).join('\n')+'\n'));vi.stubGlobal('fetch',fetcher);
 expect(await captureStaffingLiveStream(input())).toMatchObject({outcome:'terminal',nextIndex:5});
 expect(fetcher).toHaveBeenCalledTimes(2);expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('startIndex')).toBe('3');
 expect(fetcher.mock.calls.every(([,options])=>(options?.method??'GET')==='GET')).toBe(true);
});
it('does not open a read after the original deadline or widen its budget',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect(await captureStaffingLiveStream({...input(),deadlineAt:Date.now()-1})).toMatchObject({outcome:'unconfirmed',reason:'deadline'});
 await expect(captureStaffingLiveStream({...input(),deadlineAt:Date.now()+180000,suiteDeadlineAt:Date.now()+180000})).rejects.toThrow('deadline');expect(fetcher).not.toHaveBeenCalled();
});
it('reports denial without private response content or an unguarded retry',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'source_changed',message:'PRIVATE_ERROR'}),{status:409}));vi.stubGlobal('fetch',fetcher);
 const result=await captureStaffingLiveStream(input());expect(result).toMatchObject({outcome:'denied',status:409});expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects another turn and nonlocal targets without issuing commands',async()=>{
 const fetcher=vi.fn().mockResolvedValue(response(replyFixture('Wrong turn','turn_other').body));vi.stubGlobal('fetch',fetcher);
 await expect(captureStaffingLiveStream(input())).rejects.toThrow('Native live capture failed');
 for(const origin of ['https://example.com','http://user:private@127.0.0.1:3123','http://127.0.0.1:3123/other'])await expect(captureStaffingLiveStream({...input(),origin})).rejects.toThrow('owned local');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
