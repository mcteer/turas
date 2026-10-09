import { createProfileTestSession } from '../profiles';
import { withGapDatabase } from './environment';
export function gapActors(){return withGapDatabase(async db=>({panel:await createProfileTestSession(db,'panel'),mcteer:await createProfileTestSession(db,'mcteer'),partner:await createProfileTestSession(db,'partner')}));}
