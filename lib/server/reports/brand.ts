import {readFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {reportDigest} from './commands';
import {executionBackend} from '../jobs/backend';
import {recoveryReportBrandBinding} from '../operations/recovery-report-brand';
const assetSchema=z.strictObject({path:z.string().regex(/^report-templates\/(?:assets|fonts)\/[a-zA-Z0-9._-]+\.(?:svg|png|ttf|otf)$|^report-templates\/[a-zA-Z0-9._-]+\.ts$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),source:z.string().min(1).max(1000)});
export const brandManifestSchema=z.strictObject({schemaVersion:z.literal('report-brand-v1'),name:z.string().min(1).max(200),version:z.number().int().positive(),state:z.literal('draft'),officialCorporateMaster:z.literal(false),editingRequirement:z.string().min(1).max(500),guidelines:z.literal('https://vercel.com/geist/brands'),assets:z.array(assetSchema).min(4).max(20)});
/** The same immutable image has a raw digest in both local and hosted execution. */
export function reportRendererImageDigest(image:unknown){
 const parsed=typeof image==='string'?/^(?:sha256:|vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:)([a-f0-9]{64})$/.exec(image):null;
 if(!parsed)throw new HttpFailure(503,'brand_unapproved','Immutable renderer image required');
 return parsed[1];
}
export async function verifiedBundledBrand(){
 const parsed=brandManifestSchema.safeParse(JSON.parse(await readFile(resolve('report-templates/brand-manifest.json'),'utf8')));
 if(!parsed.success)throw new HttpFailure(503,'brand_unapproved','Brand manifest unavailable');
 const manifest=parsed.data;if(new Set(manifest.assets.map(asset=>asset.path)).size!==manifest.assets.length)throw new HttpFailure(503,'brand_unapproved','Brand manifest unavailable');
 for(const asset of manifest.assets){
   const file=join(resolve('report-templates'),asset.path.slice('report-templates/'.length));
   const stat=await lstat(file);if(!stat.isFile() || stat.isSymbolicLink() || stat.size>10*1024*1024)throw new HttpFailure(503,'brand_unapproved','Brand asset unavailable');
   const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new HttpFailure(503,'brand_unapproved','Brand asset changed');
  if(asset.path.endsWith('.svg') && /<(?:script|foreignObject)|(?:href|src)\s*=|on\w+\s*=/i.test(bytes.toString('utf8')))throw new HttpFailure(503,'brand_unapproved','Unsafe brand asset');
 }
 const rendererImage=process.env.TURAS_PILOT_RENDERER_IMAGE??process.env.TURAS_REPORT_RENDERER_IMAGE??null;
 const pinned=executionBackend()==='sandbox'?/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/:/^sha256:[a-f0-9]{64}$/;
 if(rendererImage!==null&&!pinned.test(rendererImage))throw new HttpFailure(503,'brand_unapproved','Immutable renderer image required');
 const enginePaths=['report-renderer/layout.ts','report-renderer/render.ts','report-renderer/validate.py'];
  const rendererCodeDigest=reportDigest(await Promise.all(enginePaths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(join(resolve('report-renderer'),path.slice('report-renderer/'.length)))).digest('hex')}))));
 const profileManifest={bundle:manifest,bundleDigest:reportDigest(manifest),rendererImage,rendererCodeDigest};
 return {profileManifest,profileDigest:reportDigest(profileManifest),rendererCodeDigest,manifest,manifestDigest:reportDigest(manifest),fontDigest:reportDigest(manifest.assets.filter(asset=>/\.(ttf|otf)$/.test(asset.path))),templateDigest:reportDigest(manifest.assets.filter(asset=>asset.path.endsWith('.ts')))};
}
export async function registerReportBrand(db:PoolClient,workspaceId:string){
 const brand=await verifiedBundledBrand();
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-brand:${process.env.TURAS_ENVIRONMENT_ID}:${workspaceId}`]);
 const existing=(await db.query('SELECT id FROM report_brand_profiles WHERE environment_id=$1 AND workspace_id=$2 AND manifest_digest=$3',[process.env.TURAS_ENVIRONMENT_ID,workspaceId,brand.profileDigest])).rows[0];if(existing)return existing.id;
 const version=Number((await db.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM report_brand_profiles WHERE environment_id=$1 AND workspace_id=$2',[process.env.TURAS_ENVIRONMENT_ID,workspaceId])).rows[0].version);
 const row=(await db.query(`INSERT INTO report_brand_profiles(id,environment_id,workspace_id,version,manifest,manifest_digest,font_digest,template_digest,state)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft') ON CONFLICT(environment_id,workspace_id,manifest_digest) DO NOTHING RETURNING id`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,workspaceId,version,JSON.stringify(brand.profileManifest),brand.profileDigest,brand.fontDigest,brand.templateDigest])).rows[0];
 return row?.id??(await db.query('SELECT id FROM report_brand_profiles WHERE environment_id=$1 AND workspace_id=$2 AND manifest_digest=$3',[process.env.TURAS_ENVIRONMENT_ID,workspaceId,brand.profileDigest])).rows[0].id;
}
export async function requireCurrentReportBrand(db:PoolClient,workspaceId:string,id:string,approved=true){
 const brand=await verifiedBundledBrand();
 const row=(await db.query('SELECT * FROM report_brand_profiles WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR SHARE',[id,process.env.TURAS_ENVIRONMENT_ID,workspaceId])).rows[0];
 const recovered=await recoveryReportBrandBinding(db,workspaceId,id);
 // Maintenance never renders with the local image. Verify the archived image
 // against these already rendered bytes, while retaining every current asset,
 // renderer-code, approval and source fence. Ordinary service stays exact.
 let profileMatches=row?.manifest_digest===brand.profileDigest;
 if(recovered&&row){
  const archived=row.manifest;
  const rendererDigest=reportRendererImageDigest(archived?.rendererImage);
  profileMatches=reportDigest(archived)===row.manifest_digest
   && reportDigest({...brand.profileManifest,rendererImage:archived.rendererImage})===row.manifest_digest
   && recovered.renderer_digest===rendererDigest&&recovered.brand_digest===row.manifest_digest
   && recovered.font_digest===brand.fontDigest&&recovered.template_digest===brand.templateDigest;
 }
 if(!row || !profileMatches || row.font_digest!==brand.fontDigest || row.template_digest!==brand.templateDigest || (approved && row.state!=='approved') || row.state==='revoked')throw new HttpFailure(503,'brand_unapproved','Current brand review is required');return {...row,bundleDigest:brand.manifestDigest,rendererCodeDigest:brand.rendererCodeDigest};
}
