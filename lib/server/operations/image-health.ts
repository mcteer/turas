import type {PoolClient} from 'pg';
import {preparedArtifactImages} from '../artifacts/prepared';
/** Pinned configuration alone proves nothing. Each configured image needs a
 * completed, domain-validated Sandbox job from this deployment after recovery.
 * Reads perform no provider calls and expose no registry/project identifiers. */
export async function readHostedImageHealth(db:PoolClient,environmentId:string,codeVersion:string){
 if(process.env.TURAS_JOB_EXECUTOR!=='sandbox')return 'unverified' as const;
 let digests:string[];
 try{
  const artifacts=preparedArtifactImages(),renderer=process.env.TURAS_PILOT_RENDERER_IMAGE;
  if(!renderer||!/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/.test(renderer))return 'unverified' as const;
  digests=[artifacts.scannerDigest,artifacts.parserDigest,renderer.split('@sha256:')[1]];
 }catch{return 'unverified' as const;}
 const rows=(await db.query(`SELECT DISTINCT ON(image_digest) image_digest,state,output_digest,output_bytes,provider_id
  FROM operations_hosted_jobs WHERE environment_id=$1 AND code_version=$2 AND image_digest=ANY($3::text[])
  AND created_at>COALESCE((SELECT max(created_at) FROM operations_control_transitions WHERE environment_id=$1 AND to_mode='locked'),'-infinity'::timestamptz)
  AND created_at<=clock_timestamp() AND created_at>clock_timestamp()-interval '24 hours'
  ORDER BY image_digest,created_at DESC,id DESC`,[environmentId,codeVersion,digests])).rows;
 return digests.every(digest=>rows.some(row=>row.image_digest===digest&&row.state==='succeeded'&&row.output_digest&&row.output_bytes!==null&&row.provider_id))?'healthy' as const:'unverified' as const;
}
