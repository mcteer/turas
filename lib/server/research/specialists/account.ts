import { withTransaction } from "../../db/client";
import { lockProfileActor } from "../../profiles/policy";
import { hiddenRecord } from "../../../contracts/http";
import type { AppIdentity } from "./identity";
export async function requireResearchAccount(identity:AppIdentity,accountId:string) {
  return withTransaction(async db=>{
    await lockProfileActor(db,identity,accountId,undefined,true);
    const account=(await db.query<{id:string;name:string;synthetic:boolean}>(
      "SELECT id,display_name AS name,synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2",
      [accountId,identity.workspaceId])).rows[0];
    if(!account || account.synthetic) throw hiddenRecord();
    return account;
  });
}
