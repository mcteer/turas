import {beforeEach} from 'vitest';
import {withGapDatabase} from './environment';
// Independent synthetic cases share memberships; preserve enforcement within
// each case while avoiding cross-case rolling-window contamination.
beforeEach(()=>withGapDatabase(db=>db.query("DELETE FROM rate_windows WHERE environment_id=$1 AND category IN ('gap_read','gap_write','gap_preparation','profile_read','profile_write')",[process.env.TURAS_TEST_ENVIRONMENT_ID])));
