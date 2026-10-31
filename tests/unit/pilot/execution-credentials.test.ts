import {beforeEach,expect,it,vi} from 'vitest';

const platform=vi.hoisted(()=>({context:{} as {headers?:Record<string,string>},calls:0}));
vi.mock('@vercel/oidc',()=>({getContext:()=>{platform.calls++;return platform.context;}}));
import {hostedExecutionCredentials} from '../../../lib/server/jobs/credentials';
import {sandboxScopeDigest} from '../../../lib/server/jobs/governed';

const target={NODE_ENV:'test' as const,VERCEL_PROJECT_ID:'prj_expected',VERCEL_TEAM_ID:'team_expected'};
const hosted={...target,VERCEL:'1',VERCEL_ENV:'preview'};
const claims=()=>({iss:'https://oidc.vercel.com/test-team',project_id:target.VERCEL_PROJECT_ID,
 owner_id:target.VERCEL_TEAM_ID,exp:Math.floor(Date.now()/1000)+900});
function jwt(value:unknown){return Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+
 Buffer.from(JSON.stringify(value)).toString('base64url')+'.'+Buffer.from('test-signature').toString('base64url');}
beforeEach(()=>{platform.context={};platform.calls=0;});

it('preserves explicit operator credentials without reading request authentication',()=>{
 platform.context={headers:{'x-vercel-oidc-token':'invalid-context'}};
 expect(hostedExecutionCredentials({...target,VERCEL_TOKEN:'operator-only'})).toEqual({
  token:'operator-only',projectId:target.VERCEL_PROJECT_ID,teamId:target.VERCEL_TEAM_ID});
 expect(platform.calls).toBe(0);
 expect(()=>hostedExecutionCredentials({NODE_ENV:'test',VERCEL_TOKEN:'operator-only'})).toThrow('credentials required');
});

it('reads a fresh project-bound platform token for each hosted operation',()=>{
 const first=jwt(claims()),second=jwt({...claims(),jti:'next-request'});
 platform.context={headers:{'x-vercel-oidc-token':first}};
 expect(hostedExecutionCredentials(hosted).token).toBe(first);
 platform.context={headers:{'x-vercel-oidc-token':second}};
 expect(hostedExecutionCredentials({...hosted,VERCEL_ENV:'production'})).toEqual({
  token:second,projectId:target.VERCEL_PROJECT_ID,teamId:target.VERCEL_TEAM_ID});
 expect(platform.calls).toBe(2);
});

it('rejects missing, expired, malformed and foreign platform credentials without an environment fallback',()=>{
 const rejected=[jwt({...claims(),project_id:'prj_foreign'}),jwt({...claims(),owner_id:'team_foreign'}),
  jwt({...claims(),exp:Math.floor(Date.now()/1000)-1}),jwt({...claims(),exp:Math.floor(Date.now()/1000)+300}),
  jwt({...claims(),iss:'https://foreign.example'}),jwt(null),jwt([]),'private-malformed-token'];
 for(const token of rejected){platform.context={headers:{'x-vercel-oidc-token':token}};
  expect(()=>hostedExecutionCredentials(hosted)).toThrow('Current project OIDC execution credentials required');}
 platform.context={};
 expect(()=>hostedExecutionCredentials({...hosted,VERCEL_OIDC_TOKEN:jwt(claims())})).toThrow('credentials required');
 platform.context={headers:{'x-vercel-oidc-token':jwt(claims())}};
 expect(()=>hostedExecutionCredentials(target)).toThrow('credentials required');
});

it('calculates the admitted sandbox identity without reading or hashing credentials',()=>{
 const env={...target,TURAS_ENVIRONMENT_ID:'test-oidc-scope',
  TURAS_PILOT_SCANNER_IMAGE:'vcr.vercel.com/team/project/scanner@sha256:'+'a'.repeat(64),
  TURAS_PILOT_PARSER_IMAGE:'vcr.vercel.com/team/project/parser@sha256:'+'b'.repeat(64),
  TURAS_PILOT_RENDERER_IMAGE:'vcr.vercel.com/team/project/renderer@sha256:'+'c'.repeat(64)};
 const expected=sandboxScopeDigest(env);
 expect(sandboxScopeDigest({...env,VERCEL_TOKEN:'operator-only'})).toBe(expected);
 expect(sandboxScopeDigest({...env,...hosted})).toBe(expected);
 expect(platform.calls).toBe(0);
});
