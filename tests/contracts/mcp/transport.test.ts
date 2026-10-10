import { describe,expect,it } from 'vitest';
import { boundedMcpDispatch,handleMcpRequest } from '../../../lib/server/mcp/transport';
import { randomUUID } from 'node:crypto';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { createMcpConnection } from '../../../lib/server/mcp/management';
const request=(method='POST',origin?:string,body='{}')=>new Request(process.env.TURAS_APP_ORIGIN+'/api/mcp/v1',
  {method,headers:{host:new URL(process.env.TURAS_APP_ORIGIN!).host,'content-type':'application/json',...(origin?{origin}:{})},...(method==='POST'?{body}:{})});
describe('MCP boundary before dispatch',()=>{
  it('bounds stalled dispatch and propagates deadline and caller cancellation',async()=>{
    let observed:AbortSignal|undefined;
    const response=await boundedMcpDispatch(request(),async r=>{observed=r.signal;return await new Promise<Response>(()=>{});},20);
    expect(response.status).toBe(503);expect(observed?.aborted).toBe(true);
    const controller=new AbortController(),r=new Request(request(),{signal:controller.signal});
    const pending=boundedMcpDispatch(r,async()=>await new Promise<Response>(()=>{}));controller.abort();
    expect((await pending).status).toBe(503);
  });
  it('charges authenticated malformed/legacy/oversized requests and rejects them before dispatch',async()=>withMcpDatabase(async db=>{
    const {browser}=await mcpFixture(db),created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic boundary client',categories:['knowledge'],customerIds:[],lifetimeDays:7});
    if(!created.secretAvailable)throw Error('No synthetic credential');
    for(const [body,status] of [['{',400],['[]',400],[JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'}),404],
      [JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),400],['x'.repeat(16385),413]] as const){
      const r=request('POST',undefined,body);r.headers.set('authorization','Bearer '+created.credential);
      const response=await handleMcpRequest(r);expect(response.status).toBe(status);expect(await response.text()).not.toContain(created.credential);
    }
    expect((await db.query("SELECT sum(count)::integer AS n FROM mcp_rate_windows WHERE bucket='connection' AND subject_id=$1",[created.connection.id])).rows[0].n).toBe(5);
  }));
  it('never treats a browser cookie as MCP bearer authentication',async()=>{
    const r=request();r.headers.set('cookie','turas_session=synthetic');
    const response=await handleMcpRequest(r);expect(response.status).toBe(401);expect(response.headers.get('WWW-Authenticate')).toMatch(/^Bearer/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('rejects foreign Host and Origin and does not reflect CORS authority',async()=>{
    const r=request();r.headers.set('host','foreign.invalid');expect((await handleMcpRequest(r)).status).toBe(403);
    const response=await handleMcpRequest(request('POST','https://foreign.invalid'));expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
  it('has only a POST transport and no session or SSE endpoints',async()=>{
    for(const method of ['GET','DELETE','OPTIONS'])expect((await handleMcpRequest(request(method))).status).toBe(405);
  });
});
