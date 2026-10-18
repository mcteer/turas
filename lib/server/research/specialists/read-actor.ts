import type {AppIdentity} from './identity';
import type {CurrentSession} from '../../auth/sessions';
import {getServerConfig} from '../../config';
import {hiddenRecord} from '../../../contracts/http';

/** Preserve the authenticated actor object when separate research metadata is
 * passed through an in-transaction governed read. Metadata never substitutes
 * for that actor or changes its session, role, workspace or environment. */
export function researchReadActor(identity:AppIdentity,actor:CurrentSession=identity):CurrentSession{
 if(identity.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID||identity.userId!==actor.principalId||
  (['sessionId','principalId','membershipId','workspaceId','token','kind','role','loginName'] as const).some(key=>identity[key]!==actor[key]))throw hiddenRecord();
 return actor;
}
