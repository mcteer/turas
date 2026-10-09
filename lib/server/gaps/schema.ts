import type { PoolClient } from 'pg';
import { HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
export async function requireGapSchema(db:PoolClient,write=false,reports=false){const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment LIMIT 1')).rows[0];if(marker?.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID||Number(marker.schema_version)<(reports?49:48))throw new HttpFailure(503,'schema_unavailable','Product gaps unavailable');if(write&&process.env.TURAS_012_DISABLED==='1')throw new HttpFailure(503,'feature_disabled','New product gap work is disabled');}
export function gapProseEnabled(){return process.env.TURAS_012_DISABLED!=='1';}
