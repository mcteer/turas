import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { hiddenRecord } from '../../contracts/http';
import { lockWorkspaceActor } from '../profiles/policy';
import { DEMO_IDS } from '../bootstrap-ids';
import { getServerConfig } from '../config';
import { requireGapSchema } from './schema';
export type GapActor=CurrentSession;
export function isGapReviewer(actor:GapActor){return actor.kind==='internal'&&actor.role==='admin'&&actor.principalId===DEMO_IDS.mcteer;}
export function requireGapReviewer(actor:GapActor){if(!isGapReviewer(actor))throw hiddenRecord();}
export async function lockGapActor(db:PoolClient,actor:GapActor,exclusive=false,reports=false){if(actor.kind!=='internal')throw hiddenRecord();await lockWorkspaceActor(db,actor,undefined,true);await requireGapSchema(db,false,reports);const row=(await db.query(`SELECT relation_generation FROM gap_workspace_state WHERE environment_id=$1 AND workspace_id=$2 ${exclusive?'FOR UPDATE':'FOR SHARE'}`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];if(!row)throw hiddenRecord();return Number(row.relation_generation);}
export async function lockGapCustomers(db:PoolClient,actor:GapActor,ids:readonly string[]){const sorted=[...new Set(ids)].sort();if(!sorted.length)return;const rows=await db.query(`SELECT s.customer_id FROM customer_profile_state s JOIN customer_references c ON c.id=s.customer_id AND c.workspace_id=s.workspace_id WHERE s.customer_id=ANY($1::uuid[]) AND s.workspace_id=$2 ORDER BY s.customer_id FOR SHARE OF s,c`,[sorted,actor.workspaceId]);if(rows.rows.length!==sorted.length)throw hiddenRecord();}
