import {z} from 'zod';
import {hostedConfigurationSchema} from '../server/operations/hosted-configuration';
const digest=z.string().regex(/^[a-f0-9]{64}$/),storeId=z.string().regex(/^[A-Za-z0-9-]{1,128}$/);
export const storageCutoverPlanSchema=z.strictObject({
 contract:z.literal('pilot-storage-cutover-plan-v1'),id:z.uuid(),environmentId:z.string().min(1).max(128),
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,target:z.enum(['preview','production']),
 origin:z.url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash;}),
 source:z.discriminatedUnion('backend',[
  z.strictObject({backend:z.literal('local'),root:z.string().min(1).max(4096)}),
  z.strictObject({backend:z.literal('blob'),storeId}),
 ]),destination:z.strictObject({backend:z.literal('blob'),storeId}),
 expectedConfiguration:hostedConfigurationSchema,
 budgetId:z.uuid(),scopeDigest:digest,pricingDigest:digest,upperBoundMicroUsd:z.number().int().positive().max(1000000000),
 maximumObjects:z.number().int().min(1).max(100000),maximumBytes:z.number().int().min(0).max(1024**4),
 expiresAt:z.iso.datetime({offset:true}),originalsRetained:z.literal(true),automaticTopUp:z.literal(false),
}).superRefine((plan,ctx)=>{
 const config=plan.expectedConfiguration;
 if(config.environmentMarker!==plan.environmentId||config.storeId!==plan.destination.storeId||plan.source.backend==='blob'&&plan.source.storeId===plan.destination.storeId)
  ctx.addIssue({code:'custom',message:'Distinct stores and exact target configuration required'});
});
export type StorageCutoverPlan=z.infer<typeof storageCutoverPlanSchema>;
