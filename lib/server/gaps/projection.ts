import {ZodError} from 'zod';
import type { PoolClient } from 'pg';
import type { GapActor } from './policy';
import type { GapContent,GapImpactContent,GapSource } from '../../contracts/product-gaps';
import { parseGapContent,parseGapImpact } from '../../product-gaps/content';
import { revisionHeader,type RevisionHeader } from './repository';
import { gapHash } from './commands';
import { gapProseEnabled } from './schema';
import { verifyGapSources } from './sources';
import { isGapWithholding } from './eligibility';
export type GapRevisionProjection={id:string;createdAt:string;authorMembershipId:string;availability:'eligible'|'withheld'|'expired'|'disabled';generation:number;content:GapContent|GapImpactContent|null;sourceRefs:GapSource[];sourceDigest:string|null};
export async function projectGapRevision(db:PoolClient,actor:GapActor,id:string|null,lock=true,header?:RevisionHeader,verifyFenced?:ReturnType<typeof import('./sources').createFencedGapVerifier> extends Promise<infer T>?T:never):Promise<GapRevisionProjection|null>{if(!id)return null;const row=header??await revisionHeader(db,actor,id);const empty={id,createdAt:row.created_at.toISOString(),authorMembershipId:row.author_membership_id,generation:Number(row.generation),content:null,sourceRefs:[],sourceDigest:null};if(!gapProseEnabled())return {...empty,availability:'disabled'};if(!row.content)return {...empty,availability:'expired'};if(row.invalidated_at||row.purge_at&&row.purge_at.getTime()<=Date.now())return {...empty,availability:'withheld'};
 try{const content=row.impact_id?parseGapImpact(row.content.content,row.content.sourceRefs):parseGapContent(row.content.content);if(gapHash(content)!==row.content_digest)return {...empty,availability:'withheld'};const current=verifyFenced&&!lock?await verifyFenced(row.content.sourceRefs):await verifyGapSources(db,actor,row.content.sourceRefs,{lock,alreadyLocked:!lock});if(current.digest!==row.source_digest)return {...empty,availability:'withheld'};return {...empty,availability:'eligible',content,sourceRefs:row.content.sourceRefs,sourceDigest:current.digest};}catch(error){if(error instanceof ZodError||isGapWithholding(error))return {...empty,availability:'withheld'};throw error;}}
