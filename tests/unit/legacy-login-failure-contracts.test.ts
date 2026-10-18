import {beforeEach,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({authenticate:vi.fn(),throttle:vi.fn(),issue:vi.fn(),record:vi.fn()}));
vi.mock('../../lib/server/auth/credentials',()=>({authenticateDemoPrincipal:mocks.authenticate}));
vi.mock('../../lib/server/auth/rate-limit',()=>({checkLoginThrottle:mocks.throttle,recordFailedLogin:vi.fn(),trustedLocalClientAddress:()=>null}));
vi.mock('../../lib/server/auth/sessions',()=>({issueSession:mocks.issue,sessionCookie:()=>{throw Error('No cookie may be constructed after storage failure');}}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_APP_ORIGIN:'http://localhost:3000'})}));
vi.mock('../../lib/server/observability',()=>({recordOperationalEvent:mocks.record}));
import {POST} from '../../app/api/auth/login/route';

beforeEach(()=>{
 vi.clearAllMocks();
 mocks.throttle.mockResolvedValue(undefined);
 mocks.authenticate.mockResolvedValue({principalId:'synthetic-owner',workspaceId:'synthetic-workspace'});
});

it.each([
 Object.assign(new Error('password authentication failed postgresql://private-user:private-password@private-host/private-db'),{code:'28P01'}),
 new Error('Compute quota exceeded: private-account'),
 new Error('fetch failed private-host'),
 new Error('TURAS_SESSION_SECRET private-configuration'),
 {code:'postgresql://private-host',stack:'private-stack'},
])('keeps failed session storage unavailable and private for JSON and native login',async failure=>{
 mocks.issue.mockRejectedValue(failure);
 for(const native of [false,true]){
  const input={username:'mcteer',password:'synthetic-password',returnTo:'/s'};
  const response=await POST(new Request('http://localhost:3000/api/auth/login',{
   method:'POST',headers:{origin:'http://localhost:3000','content-type':native?'application/x-www-form-urlencoded':'application/json'},
   body:native?new URLSearchParams(input):JSON.stringify(input),
  }));
  expect(response.status).toBe(native?303:503);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  if(native){
   const location=new URL(response.headers.get('location')!,'http://localhost:3000');
   expect(location.pathname).toBe('/login');expect(location.searchParams.get('error')).toBe('unavailable');
   expect(location.searchParams.get('returnTo')).toBe('/s');
   expect(await response.text()).toBe('');expect(location.href).not.toMatch(/private-|password|28P01|stack|postgresql/);
  }else{
   expect(response.headers.get('location')).toBeNull();const body=await response.json();
   expect(body.error).toEqual({code:'unavailable',message:'Service unavailable'});
   expect(JSON.stringify(body)).not.toMatch(/private-|password|28P01|stack|postgresql/);
  }
 }
 expect(mocks.issue).toHaveBeenCalledTimes(2);
 expect(mocks.record).toHaveBeenCalledTimes(2);
 for(const [event] of mocks.record.mock.calls){expect(event).toMatchObject({action:'login',outcome:'failed'});expect(event.errorCode).toMatch(/^issue_session_(?:service_limit|database_authentication|database_network|configuration|unclassified)(?:_[0-9A-Z]{5})?$/);expect(JSON.stringify(event)).not.toMatch(/private-|password|stack|postgresql/);}
});
