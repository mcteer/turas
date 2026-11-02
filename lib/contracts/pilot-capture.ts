import {CURRENT_SCHEMA_VERSION} from './current-schema';
import {z} from 'zod';
const digest=z.string().regex(/^[a-f0-9]{64}$/),identity=z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),bytes=z.number().int().nonnegative().max(1024**4);
const entry=z.strictObject({name:z.string().min(1).max(1024),sizeBytes:bytes,digest});
/** Integrity candidates explicitly exclude the independent recovery proofs. */
export const pilotCaptureCandidateSchema=z.strictObject({
 contract:z.literal('pilot-capture-candidate-v1'),id:z.uuid(),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,
 environmentId:z.string().regex(/^test-pilot-[a-f0-9]{12}$/),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),capturedAt:z.iso.datetime({offset:true}),sourceDatabaseName:z.string().regex(/^turas_test_016_eval_[a-f0-9]{12}$/),schemaVersion:z.union([z.literal(79),z.literal(80),z.literal(81),z.literal(82),z.literal(83),z.literal(84),z.literal(CURRENT_SCHEMA_VERSION)]),ledgerDigest:digest,runtimeGrantsDigest:digest,acceptedContentDigest:digest,configurationDigest:digest,
 database:z.strictObject({digest,sizeBytes:bytes.refine(value=>value>0),serverMajor:z.union([z.literal(17),z.literal(18)]),clientMajor:z.union([z.literal(17),z.literal(18)])}),
 objects:z.strictObject({inventoryDigest:digest,objectCount:z.number().int().nonnegative().max(100000),entries:z.array(entry).max(100000)}),
 workflow:z.strictObject({inventoryDigest:digest,fileCount:z.number().int().nonnegative().max(100000),entries:z.array(entry).max(100000),stableBytesCaptured:z.literal(true),runtimeStoppedVerified:z.literal(false),resumptionVerified:z.literal(false)}),
 encryptedBundle:z.strictObject({headerDigest:digest,digest,sizeBytes:bytes.refine(value=>value>=68)}),
 key:z.strictObject({reference:identity,version:identity,available:z.literal(true),probeDigest:digest}),originalsRetained:z.literal(true),currentAuthorityVerified:z.literal(false),outsideCopyVerified:z.literal(false),scheduledBackupVerified:z.literal(false),restorationReady:z.literal(false),mode:z.literal('locked'),providerCalls:z.literal(0),
}).superRefine((value,ctx)=>{
 if(value.database.serverMajor!==value.database.clientMajor||value.objects.objectCount!==value.objects.entries.length||value.workflow.fileCount!==value.workflow.entries.length||value.objects.entries.some(row=>!row.name.startsWith('objects/'))||value.workflow.entries.some(row=>!row.name.startsWith('workflow/')))ctx.addIssue({code:'custom',message:'Candidate checkpoint inventory differs'});
});
export type PilotCaptureCandidate=z.infer<typeof pilotCaptureCandidateSchema>;

/** Hosted byte capture remains a candidate. Managed Workflow execution cannot
 * be represented as a filesystem checkpoint or resumed by copying old files. */
export const workCaptureCandidateSchema=z.strictObject({...pilotCaptureCandidateSchema.shape,
 contract:z.literal('pilot-work-capture-candidate-v1'),
 environmentId:identity,
 sourceDatabaseName:z.string().min(1).max(256),
 mode:z.enum(['locked','open']),
 database:z.strictObject({digest,sizeBytes:bytes.refine(value=>value>0),serverMajor:z.literal(18),clientMajor:z.literal(18)}),
 workflow:z.strictObject({inventoryDigest:digest,fileCount:z.literal(0),entries:z.array(entry).length(0),backend:z.literal('managed-workflow'),capability:z.literal('interrupted-reconciliation'),runtimeStoppedVerified:z.literal(false),resumptionVerified:z.literal(false),reconciliationVerified:z.literal(false)}),
}).omit({providerCalls:true}).extend({modelCalls:z.literal(0),mailCalls:z.literal(0)}).superRefine((value,ctx)=>{
 if(value.database.serverMajor!==value.database.clientMajor||value.objects.objectCount!==value.objects.entries.length||value.objects.entries.some(row=>!row.name.startsWith('objects/')))ctx.addIssue({code:'custom',message:'Work candidate checkpoint inventory differs'});
});
export type WorkCaptureCandidate=z.infer<typeof workCaptureCandidateSchema>;
