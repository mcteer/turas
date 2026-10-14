import type { CurrentSession } from "../../auth/sessions";
import { getServerConfig } from "../../config";
import { withTransaction } from "../../db/client";
import { customerQuestionActor } from "../../conversations/customer-accounts";

/** The legacy receipt identity is backed by the current live session and role,
 * rather than legacy demo logins or a model-supplied owner/workspace. */
export type AppIdentity = CurrentSession & { userId: string; environmentId: string };
export async function researchIdentity(principal: Parameters<typeof customerQuestionActor>[1]): Promise<AppIdentity> {
  const {actor} = await withTransaction(db => customerQuestionActor(db,principal));
  return {...actor,userId:actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID};
}
