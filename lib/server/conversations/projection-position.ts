import type {PoolClient} from 'pg';
import type {NativeEvent} from './projection';
/** Line positions address complete commits; fact positions distinguish their
 * immutable observations. Legacy events retain the database's zero default. */
export async function projectionFactIndex(db:PoolClient,event:NativeEvent):Promise<number|null>{
 if(event.meta.protocol!==27)return null;
 const index=event.meta.position?.index;
 if(!Number.isSafeInteger(index)||Number(index)<0)throw Error('Native fact position unavailable');
 const schema=Number((await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0]?.schema_version??0);
 if(schema<83)throw Error('Native fact positions require schema 83');
 return Number(index);
}
