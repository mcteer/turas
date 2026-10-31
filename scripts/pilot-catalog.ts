import catalog from "./pilot-catalog.json";
import { pilotCatalogSchema } from "../lib/contracts/pilot-readiness";
import suites from './pilot-suites.json';
import {pilotSuiteCaseIds} from './pilot-suite-results';
/** Reject phantom references before any owned environment or receipt is made. */
export function assertPilotCatalogInventory(candidate:{gates:readonly {id:string;localCaseIds:readonly string[]}[]},inventory:Pick<typeof suites,'suites'>=suites){
 const files=new Set<string>(),ids=new Set<string>();
 for(const suite of inventory.suites){
  if(files.has(suite.file)||suite.cases.length!==suite.expectedCases||new Set(suite.cases).size!==suite.expectedCases)throw Error('Invalid pilot suite inventory');
  files.add(suite.file);
  for(const id of pilotSuiteCaseIds(suite.file,suite.expectedCases)){
   if(ids.has(id))throw Error('Ambiguous pilot suite case ID');
   ids.add(id);
  }
 }
 for(const gate of candidate.gates){
  if(new Set(gate.localCaseIds).size!==gate.localCaseIds.length)throw Error('Duplicate pilot catalog case ID: '+gate.id);
  if(gate.localCaseIds.some(id=>!ids.has(id)))throw Error('Pilot catalog references unregistered case: '+gate.id);
 }
}
const parsedCatalog=pilotCatalogSchema.parse(catalog);
assertPilotCatalogInventory(parsedCatalog);
export const pilotCatalog = parsedCatalog;
export const pilotMaintenanceClasses = Object.freeze(pilotCatalog.maintenance.map(item=>Object.freeze(item)));
