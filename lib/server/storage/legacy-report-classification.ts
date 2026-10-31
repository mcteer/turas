import {z} from 'zod';
const row=z.strictObject({object_key:z.uuid(),namespace:z.enum(['report','gap-report'])});
/** Explicit ledger classification; never infer report audience from a filename.
 * Collisions remain blocked even when bytes happen to match. */
export function legacyReportClassification(input:unknown){
 const rows=z.array(row).max(100000).parse(input),result=new Map<string,'report'|'gap-report'>();
 for(const value of rows){if(result.has(value.object_key))throw Error('Legacy report identity collision');result.set(value.object_key,value.namespace);}
 return result;
}
