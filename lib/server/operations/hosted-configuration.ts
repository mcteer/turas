import {z} from 'zod';

const image=z.string().regex(/^vcr\.vercel\.com\/[A-Za-z0-9_/-]+@sha256:[a-f0-9]{64}$/);
/** Configured identity only; these fields never assert provider health or authority. */
export const hostedConfigurationSchema=z.strictObject({
 contract:z.literal('pilot-hosted-configuration-v1'),
 environmentMarker:z.string().min(1).max(128),
 projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),
 storeId:z.string().regex(/^[A-Za-z0-9-]{1,128}$/),
 objectBackend:z.literal('blob'),executor:z.literal('sandbox'),dispatcherEnabled:z.boolean(),
 images:z.strictObject({scanner:image,parser:image,renderer:image}),
 maximumConcurrentJobs:z.literal(2),maximumDeadlineMs:z.literal(300000),
 maximumInputBytes:z.literal(10485760),maximumOutputBytes:z.literal(52428800),
 maximumSandboxDispatches:z.number().int().min(1).max(100000),
 costBudgetId:z.uuid(),costScopeDigest:z.string().regex(/^[a-f0-9]{64}$/),costPricingDigest:z.string().regex(/^[a-f0-9]{64}$/),
 embeddingProviderConfigured:z.boolean(),
 blobSdkRetries:z.literal(0),
});
export type HostedConfiguration=z.infer<typeof hostedConfigurationSchema>;
/** Safe allowlist for the existing authenticated administrator diagnostics. */
export function readHostedConfiguration(env:Partial<NodeJS.ProcessEnv>=process.env):HostedConfiguration|null{
 let costs:{maximumDispatches?:unknown;budgetId?:unknown;scopeDigest?:unknown;pricingDigest?:unknown};
 try{const raw=env.TURAS_PILOT_JOB_COST_JSON;if(!raw||Buffer.byteLength(raw)>8192)return null;costs=JSON.parse(raw);if(!costs||typeof costs!=='object')return null;}catch{return null;}
 const parsed=hostedConfigurationSchema.safeParse({
  contract:'pilot-hosted-configuration-v1',environmentMarker:env.TURAS_ENVIRONMENT_ID,
  projectId:env.VERCEL_PROJECT_ID,teamId:env.VERCEL_TEAM_ID,
  storeId:env.BLOB_STORE_ID?.replace(/^store_/,''),objectBackend:env.TURAS_PRIVATE_OBJECT_BACKEND,
  executor:env.TURAS_JOB_EXECUTOR,dispatcherEnabled:['0','1'].includes(env.TURAS_PILOT_HOSTED_JOBS_ENABLED??'')?env.TURAS_PILOT_HOSTED_JOBS_ENABLED==='1':undefined,
  images:{scanner:env.TURAS_PILOT_SCANNER_IMAGE,parser:env.TURAS_PILOT_PARSER_IMAGE,renderer:env.TURAS_PILOT_RENDERER_IMAGE},
  maximumConcurrentJobs:2,maximumDeadlineMs:300000,maximumInputBytes:10485760,maximumOutputBytes:52428800,
  maximumSandboxDispatches:costs.maximumDispatches,costBudgetId:costs.budgetId,costScopeDigest:costs.scopeDigest,costPricingDigest:costs.pricingDigest,
  embeddingProviderConfigured:Boolean(env.AI_GATEWAY_API_KEY),blobSdkRetries:env.VERCEL_BLOB_RETRIES==='0'?0:undefined,
 });
 return parsed.success?parsed.data:null;
}
export function verifyHostedConfiguration(raw:unknown,expected:HostedConfiguration){
 const observed=hostedConfigurationSchema.parse(raw),wanted=hostedConfigurationSchema.parse(expected);
 if(JSON.stringify(observed)!==JSON.stringify(wanted))throw Error('Hosted runtime configuration differs');
 return observed;
}
