import {withTransaction} from '../../db/client';
import {lockProfileActor,requireSteward} from '../../profiles/policy';
import type {AppIdentity} from '../../research/specialists/identity';
export async function canReviewWorkspaceSolution(identity:AppIdentity,accountId:string){
 return withTransaction(async db=>{await lockProfileActor(db,identity,accountId);await requireSteward(db,identity,accountId);return true;});
}
