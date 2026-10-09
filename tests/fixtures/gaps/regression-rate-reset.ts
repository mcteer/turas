import {beforeEach} from 'vitest';
import {Client} from 'pg';
import {requireOwnedExecutionClone} from '../../../scripts/execution-eval-environment';
import {requireOwnedExpansionClone} from '../../../scripts/expansion-eval-environment';
import {requireOwnedSupportClone} from '../../../scripts/support-eval-environment';
const raw=process.env.TURAS_GAPS_REGRESSION_KIND==='execution'?requireOwnedExecutionClone():process.env.TURAS_GAPS_REGRESSION_KIND==='expansion'?requireOwnedExpansionClone():process.env.TURAS_GAPS_REGRESSION_KIND==='support'?requireOwnedSupportClone():null;
if(!raw)throw Error('Owned legacy regression cohort required');
// Independent synthetic cases reuse canonical identities. Keep real enforcement
// throughout each case; clear only the owning environment between cases.
beforeEach(async()=>{const db=new Client({connectionString:raw});await db.connect();try{await db.query('DELETE FROM execution_rate_windows WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID]);await db.query("DELETE FROM rate_windows WHERE environment_id=$1 AND (category LIKE 'expansion_%' OR category LIKE 'support_%' OR category IN('profile_read','profile_write'))",[process.env.TURAS_ENVIRONMENT_ID]);}finally{await db.end();}});
