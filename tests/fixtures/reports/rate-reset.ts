import {beforeEach} from 'vitest';
import {withReportsDatabase} from './environment';
/** Independent controlled cases get isolated quota windows in the verified
 * owned report clone. No reset occurs within a case or a measured journey. */
beforeEach(async()=>withReportsDatabase(async db=>{
 await db.query('DELETE FROM report_rate_windows WHERE environment_id=$1',[process.env.TURAS_ENVIRONMENT_ID]);
}));
