import {gapRead} from './commands';
import type {GapActor} from './policy';
import {lockGapCustomers} from './policy';
import {HttpFailure} from '../../contracts/http';
export function readGapCustomerWorkloads(actor:GapActor,customerId:string){return gapRead(actor,async db=>{await lockGapCustomers(db,actor,[customerId]);const rows=(await db.query("SELECT id,display_name FROM customer_workloads WHERE customer_id=$1 AND workspace_id=$2 AND lifecycle='active' ORDER BY display_name,id LIMIT 51",[customerId,actor.workspaceId])).rows;if(rows.length>50)throw new HttpFailure(413,'scope_too_large','Workload choices exceed the supported page; choose customer-wide scope');return {workloads:rows.map(r=>({id:r.id,name:r.display_name}))};});}
