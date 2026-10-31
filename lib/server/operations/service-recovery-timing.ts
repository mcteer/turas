import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {z} from 'zod';
import type {Client} from 'pg';

const timestamp=z.iso.datetime({offset:true});
const clocks=z.strictObject({capturedAt:timestamp,incidentStartedAt:timestamp,targetCreatedAt:timestamp,openedAt:timestamp,verifiedServiceAt:timestamp});
/** Arithmetic only. These limits do not authenticate a recovery or establish
 * service readiness. The live owner producer obtains every clock independently. */
export function serviceRecoveryIntervals(input:unknown){
 const value=clocks.parse(input),capture=Date.parse(value.capturedAt),incident=Date.parse(value.incidentStartedAt),target=Date.parse(value.targetCreatedAt),open=Date.parse(value.openedAt),finish=Date.parse(value.verifiedServiceAt);
 if(capture>incident||incident>target||target>open||open>finish)throw Error('Service recovery timing order differs');
 return {...value,acceptedWorkLossUpperBoundMs:incident-capture,incidentToVerifiedServiceMs:finish-incident,
  maximumAcceptedWorkLossMs:86400000,maximumVerifiedServiceRecoveryMs:14400000,
  captureWithin24Hours:incident-capture<=86400000,verifiedServiceWithin4Hours:finish-incident<=14400000};
}

/** The first immutable source fence after this capture is the incident clock.
 * Selecting a later fence or replaying its command cannot shorten the interval. */
export async function readRecoveryIncident(db:Client,input:{environmentId:string;capturedAt:string;operationId:string}){
 z.uuid().parse(input.operationId);timestamp.parse(input.capturedAt);
 const authority=(await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0];
 const marker=(await db.query('SELECT e.environment_id,e.schema_version,c.mode,c.recovery_id,clock_timestamp() AS now FROM turas_environment e JOIN operations_control c USING(environment_id)')).rows;
 if(!authority?.owner||marker.length!==1||marker[0].environment_id!==input.environmentId||Number(marker[0].schema_version)!==CURRENT_SCHEMA_VERSION||!['quiescing','locked'].includes(marker[0].mode))throw Error('Closed original owner incident required');
 const rows=(await db.query(`SELECT id,recovery_id,revision,created_at FROM operations_control_transitions
  WHERE environment_id=$1 AND from_mode='open' AND to_mode='quiescing' AND created_at>=$2::timestamptz
  ORDER BY created_at,revision LIMIT 1`,[input.environmentId,input.capturedAt])).rows,row=rows[0];
 if(rows.length!==1||row.id!==input.operationId||!z.uuid().safeParse(row.recovery_id).success||row.recovery_id!==marker[0].recovery_id||!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<2||row.created_at>marker[0].now)throw Error('Original incident transition differs');
 return {operationId:row.id as string,recoveryId:row.recovery_id as string,controlRevision:Number(row.revision),incidentStartedAt:(row.created_at as Date).toISOString()};
}
