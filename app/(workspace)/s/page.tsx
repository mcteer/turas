import {ordinaryNativeFilesEnabled} from '../../../lib/server/conversations/native-file-policy';
import { cookies } from "next/headers";
import { getCurrentSession } from "../../../lib/server/auth/sessions";
import { csrfTokenForSession } from "../../../lib/server/auth/csrf";
import { getServerConfig } from "../../../lib/server/config";
import { query } from "../../../lib/server/db/client";
import { NewConversation } from "../../_components/new-conversation";

export default async function NewConversationPage() {
  const session = await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN, {
    headers: { cookie: (await cookies()).toString() },
  }));
  if (!session) return null;
  const marker=await query<{schema_version:number}>("SELECT schema_version FROM turas_environment WHERE environment_id=$1",[getServerConfig().TURAS_ENVIRONMENT_ID]);
  const canAttachDocuments=Number(marker.rows[0]?.schema_version??0)>=71&&process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED!=="1";
  return <NewConversation csrfToken={csrfTokenForSession(session.token)} canAttachDocuments={canAttachDocuments} canAttachNativeFiles={canAttachDocuments&&Number(marker.rows[0]?.schema_version??0)>=72&&ordinaryNativeFilesEnabled()} />;
}
