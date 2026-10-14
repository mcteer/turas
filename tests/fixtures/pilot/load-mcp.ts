import {randomUUID} from 'node:crypto';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import type {pilotLoadEvidenceFixture} from './load';
/** Credentials remain in caller memory; they are never part of benchmark
 * evidence. Every connection is individually scoped and normally issued. */
export async function pilotLoadMcpConnections(evidence:Awaited<ReturnType<typeof pilotLoadEvidenceFixture>>){
 requireOwnedPilotDatabase();const connections=[];
 for(const [actorIndex,actor] of evidence.actors.entries()){
  // Existing cap is 100 customers per connection. Keep a fixed common delivery
  // sample plus a rotated subset; ordinary profile reads cover all 250 customers.
  const customerIds=[evidence.customers[0].id,...Array.from({length:99},(_,index)=>evidence.customers[1+(actorIndex*10+index)%249].id)];
  const created=await createMcpConnection(actor,{requestKey:randomUUID(),name:'Synthetic fixed pilot load',categories:['profiles','evidence','knowledge','plans','reports'],customerIds,lifetimeDays:1});if(!created.secretAvailable)throw Error('Normally issued load MCP connection unavailable');
  connections.push({actorIndex,connectionId:created.connection.id,credential:created.credential,customerIds});
 }
 return connections;
}
