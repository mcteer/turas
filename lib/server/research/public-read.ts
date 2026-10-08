import type {PoolClient} from 'pg';
import type {ProfileActor} from '../profiles/policy';
import {lockProfileActor} from '../profiles/policy';
import {getServerConfig} from '../config';
import {publicDossierSchema} from './public-dossier';

export async function readPublicCustomerCoverage(db:PoolClient,actor:ProfileActor,customerId:string){
 await lockProfileActor(db,actor,customerId,undefined,true);
 const marker=(await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 if(!marker||marker.schema_version<45)return null;
 const found=await db.query<{dossier:unknown;created_at:Date}>(`SELECT r.dossier,r.created_at FROM public_customer_research_results r
  WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.customer_id=$3
    AND NOT EXISTS(SELECT 1 FROM unnest(r.source_revision_ids) AS used(id)
      LEFT JOIN evidence_source_revisions v ON v.id=used.id AND v.workspace_id=r.workspace_id AND v.customer_id=r.customer_id
      WHERE v.id IS NULL OR v.audience<>'delivery' OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=used.id AND e.event_type IN('withdraw','supersede')))
  ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId]);
 if(!found.rows[0])return null;
 const parsed=publicDossierSchema.safeParse(found.rows[0].dossier);
 // Stored receipt includes provenance alongside the strict authored dossier.
 const raw=found.rows[0].dossier as Record<string,unknown>;
 const bounded=parsed.success?parsed:publicDossierSchema.safeParse({description:raw.description,findings:raw.findings,coverage:raw.coverage,unknowns:raw.unknowns});
 if(!bounded.success)return null;
 return {asOf:found.rows[0].created_at.toISOString(),coverage:bounded.data.coverage,unknowns:bounded.data.unknowns};
}
