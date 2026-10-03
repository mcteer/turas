import type { readExecutionOverview,readExecutionRecords } from '../../../lib/server/execution/service';
import type { ExecutionRecordContent,ExecutionSource } from '../../../lib/server/execution/schema';
export type Overview=Awaited<ReturnType<typeof readExecutionOverview>>;
export type RecordView=Awaited<ReturnType<typeof readExecutionRecords>>['records'][number];
export type Session={csrfToken:string;membership:{id:string;kind:'internal'|'partner';role:string}};
export type Owner={id:string;label:string};
export type Mutation=(action:string,expectedVersions:Record<string,number>,payload:unknown,confirmed?:()=>void)=>Promise<boolean>;
export type Candidate={version:'execution-v1';action:string;expectedVersions:Record<string,number>;payload:unknown;display?:Array<{title:string;detail:string}>};
export type {ExecutionRecordContent,ExecutionSource};
