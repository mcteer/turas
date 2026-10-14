import catalog from "./pilot-catalog.json";
import { pilotCatalogSchema } from "../lib/contracts/pilot-readiness";
export const pilotCatalog = pilotCatalogSchema.parse(catalog);
export const pilotMaintenanceClasses = Object.freeze(pilotCatalog.maintenance.map(item=>Object.freeze(item)));
