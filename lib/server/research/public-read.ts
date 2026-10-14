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
      LEFT JOIN evidence_sources original ON original.id=v.source_id AND original.origin='independent_research'
      LEFT JOIN research_checks checked ON checked.source_revision_id=v.id
      WHERE v.id IS NULL OR original.id IS NULL OR v.audience<>'delivery'
        OR NOT COALESCE(checked.identity_result AND checked.scope_result AND checked.integrity_result AND checked.content_result,false)
        OR EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=used.id AND e.event_type IN('withdraw','supersede'))
        OR EXISTS(SELECT 1 FROM evidence_conflict_targets conflict WHERE conflict.environment_id=r.environment_id AND conflict.state='confirmed'
          AND ((conflict.first_kind='verified_research' AND conflict.first_revision_id=v.id)
            OR (conflict.second_kind='verified_research' AND conflict.second_revision_id=v.id))))
  ORDER BY r.created_at DESC,r.id DESC LIMIT 20`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId]);
 if(!found.rows[0])return null;
 const eligible=found.rows.flatMap(row=>{
  const raw=row.dossier as Record<string,unknown>;
  const parsed=publicDossierSchema.safeParse({description:raw.description,findings:raw.findings,coverage:raw.coverage,unknowns:raw.unknowns});
  return parsed.success?[{...parsed.data,asOf:row.created_at.toISOString()}]:[];
 });
 const latest=eligible[0];if(!latest)return null;
 const described=eligible.find(row=>row.description.trim());
 // Focused research augments current knowledge without erasing other eligible
 // source coverage. Retired or conflicted receipt closures were excluded above.
 const coverage=latest.coverage.map(area=>eligible.flatMap(row=>row.coverage).find(candidate=>candidate.area===area.area&&candidate.state==='supported')??area);
 return {asOf:latest.asOf,description:described?.description??"",descriptionAsOf:described?.asOf??null,coverage,unknowns:latest.unknowns};
}
