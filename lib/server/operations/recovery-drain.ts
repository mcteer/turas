import type {Client,PoolClient} from 'pg';
/** Owner transaction only. Inspect every actual lease column, including older
 * domain workers; the deployment must also stop unfenced old workers. */
export async function recoveryLeasesOutstanding(db:Client|PoolClient){
 const columns=(await db.query(`SELECT c.table_name,c.column_name,EXISTS(SELECT 1 FROM information_schema.columns s WHERE s.table_schema='public' AND s.table_name=c.table_name AND s.column_name='state') AS has_state
  FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
  WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.column_name IN('lease_until','lease_expires_at') ORDER BY c.table_name,c.column_name`)).rows;
 if(!columns.length||columns.length>100||columns.some(c=>!/^[a-z_][a-z0-9_]*$/.test(c.table_name)||!['lease_until','lease_expires_at'].includes(c.column_name)))throw Error('Recovery lease inventory unavailable');
 const tables=[...new Set<string>(columns.map(c=>c.table_name))];await db.query('LOCK TABLE '+tables.map(name=>'public."'+name+'"').join(',')+' IN SHARE MODE');
 const expressions=columns.map(c=>`EXISTS(SELECT 1 FROM public."${c.table_name}" WHERE "${c.column_name}">clock_timestamp()${c.has_state?" AND state::text NOT IN('done','failed','cancelled','expired','stale','completed','released','deleted')":''})`);
 return (await db.query('SELECT '+expressions.join(' OR ')+" OR EXISTS(SELECT 1 FROM public.report_deliveries WHERE state='dispatching') AS active")).rows[0]?.active!==false;
}
