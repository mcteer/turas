import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { partnerTransaction } from "./repository";
import { lockPartnerActor } from "./policy";
export async function requirePartnerPage(){const actor=await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN,{headers:{cookie:(await cookies()).toString()}}));if(!actor)redirect("/login");await partnerTransaction(db=>lockPartnerActor(db,actor));return actor;}
