import type {Client,PoolClient} from 'pg';
import {assertDeterministicTestMode} from './runtime';

/** Settle only this domain-only fixture's synthetic attempts. This is test
 * teardown, never evidence that an actual Eve workflow acknowledged a stop. */
export async function settleSyntheticConversationAttempts(db:Client|PoolClient,conversationIds:readonly string[]){
 assertDeterministicTestMode();if(!conversationIds.length)return;
 const marker=(await db.query('SELECT current_database() AS database,environment_id FROM turas_environment')).rows;
 if(marker.length!==1||!/^turas_test(?:_|$)/.test(String(marker[0].database))||!String(marker[0].environment_id).startsWith('test-')||marker[0].environment_id!==process.env.TURAS_TEST_ENVIRONMENT_ID)throw Error('Owned test database required for fixture settlement');
 const native=(await db.query('SELECT eve_session_id FROM conversations WHERE id=ANY($1::uuid[])',[conversationIds])).rows;
 if(native.some(row=>row.eve_session_id!==null&&!/^wrun_[a-f0-9-]{36}$/.test(row.eve_session_id)))throw Error('Domain fixture settlement cannot touch a real native workflow');
 await db.query("UPDATE response_attempts SET response_state='cancelled' WHERE conversation_id=ANY($1::uuid[]) AND response_state IN('pending','running','stopping')",[conversationIds]);
 await db.query("UPDATE watchdog_jobs SET state='settled',lease_owner=NULL,lease_expires_at=NULL WHERE attempt_id IN(SELECT id FROM response_attempts WHERE conversation_id=ANY($1::uuid[]))",[conversationIds]);
}
