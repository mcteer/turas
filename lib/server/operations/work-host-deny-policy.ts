import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {canonicalManagedHost} from './managed-alias-inventory';
const condition=z.strictObject({type:z.literal('host'),op:z.literal('ninc'),value:z.array(z.string().min(1).max(260)).min(1).max(16)});
const rule=z.strictObject({id:z.string().min(1).max(256),name:z.string().max(256),description:z.string().max(2048),active:z.literal(true),valid:z.literal(true),validationErrors:z.null(),conditionGroup:z.array(z.strictObject({conditions:z.array(condition).length(1)})).length(1),action:z.strictObject({mitigate:z.strictObject({action:z.literal('deny')})})});
const schema=z.strictObject({firewallEnabled:z.literal(true),crs:z.record(z.string(),z.strictObject({action:z.enum(['log','deny','challenge']),active:z.boolean()})),updatedAt:z.string().min(1).max(64),projectKey:z.string().max(256),id:z.string().min(1).max(256),ips:z.array(z.unknown()).length(0),changes:z.array(z.unknown()).max(1000),version:z.number().int().positive().safe(),ownerId:z.string().regex(/^team_[A-Za-z0-9]+$/),rules:z.array(rule).length(1)});
/** Validate the documented FIRST/ONLY unconditional custom-WAF deny shape.
 * This parser alone proves no provider read, hostname binding or HTTP outcome. */
export function inspectWorkHostDenyPolicy(raw:unknown,scope:{projectId:string;teamId:string;approvedHosts:readonly string[]}){
 z.string().regex(/^prj_[A-Za-z0-9]+$/).parse(scope.projectId);z.string().regex(/^team_[A-Za-z0-9]+$/).parse(scope.teamId);
 const policy=schema.parse(raw),hosts=policy.rules[0].conditionGroup[0].conditions[0].value;
 const expected=z.array(z.string()).min(1).max(16).parse(scope.approvedHosts);
 for(const values of [hosts,expected])if(new Set(values.map(canonicalManagedHost)).size!==values.length||values.some(host=>canonicalManagedHost(host)!==host))throw Error('Exact canonical distinct host allowlist required');
 if(policy.projectKey!==scope.projectId+'#active'||policy.ownerId!==scope.teamId||JSON.stringify([...hosts].sort())!==JSON.stringify([...expected].sort()))throw Error('Active host-deny project or approved bindings differ');
 return Object.freeze({contract:'pilot-work-host-deny-policy-v1' as const,projectId:scope.projectId,teamId:scope.teamId,version:policy.version,policyDigest:recoveryDigest(policy),allowedHosts:Object.freeze([...hosts].sort()),firstOnlyUnconditionalHostDenyValidated:true as const,providerReadVerified:false as const,httpAdmissionClosed:false as const,restorationReady:false as const});
}
