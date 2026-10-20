import {actorLockSettingsSql} from "../../../lib/server/profiles/authority-lock-sql";
import {it,expect} from 'vitest';
import {assertRecoveryDecisionSql as check} from '../../../lib/server/operations/recovery-decision-sql';
it('keeps commit rollback and implicit transaction control out of decision callbacks',()=>{
 for(const sql of ['COMMIT',"SELECT $é$'$é$; COMMIT; SELECT $é$'$é$",'SELECT 1; -- hidden\rCOMMIT','SELECT 1; -- hidden\r\nCOMMIT','SELECT 1; END','/* nested /* comment */ */ BEGIN','ROLLBACK','ABORT','START TRANSACTION','PREPARE TRANSACTION \'x\'','DO $$ BEGIN COMMIT; END $$','SET SESSION statement_timeout=0'])expect(()=>check(sql)).toThrow();
});
it('accepts canonical queries local deadlines and savepoint rollback without interpreting quoted payloads',()=>{
 for(const sql of [actorLockSettingsSql,"SELECT CASE WHEN true THEN 'COMMIT; END' ELSE 'ROLLBACK' END",'WITH candidate AS (SELECT 1) SELECT * FROM candidate','SAVEPOINT recovery; ROLLBACK TO SAVEPOINT recovery; RELEASE SAVEPOINT recovery',"SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",'SET LOCAL lock_timeout=1000','UPDATE principals SET display_name=$1 WHERE id=$2'])expect(()=>check(sql)).not.toThrow();
});
it('rejects ambiguous parsing or attempts to change parser settings',()=>{
 for(const sql of [actorLockSettingsSql+"; SELECT 1",actorLockSettingsSql.replace("THEN 'write'","THEN 'other'"),"SELECT set_config('turas.actor_lock_mode','read',true)","SELECT set_config('turas.actor_lock_mode',$1,true)","SELECT set_config('turas.actor_lock_mode','read',false)","SELECT set_config('turas.actor_lock_mode','read',true); SELECT 1","SELECT set_config('turas.actor_lock_mode','other',true)","SELECT set_config('transaction_timeout','0',true)","SET LOCAL transaction_timeout='120s'","SELECT E''\n'\\''; COMMIT; SELECT E''\n'\\''","SELECT $$unsupported$$",'', "SELECT 'unclosed",'SELECT $$unclosed','/* unclosed',"SELECT set_config('standard_conforming_strings','off',true)",'SELECT set_config($1,$2,true)',"SELECT set_config('standard_' || 'conforming_strings','off',true)","SELECT \"set_config\"('backslash_quote','on',true)",'SET LOCAL standard_conforming_strings=off','SET LOCAL U&"standard\\005fconforming_strings"=off',"SELECT U&\"set\\005fconfig\"('standard_conforming_strings','off',true)"])expect(()=>check(sql)).toThrow();
});
