import { z } from "zod";
import { attachmentLimits } from "../conversations/attachment-text";
export const nativeUploadChunkBytes = 512 * 1024;
export const nativeUploadIntentSchema = z.object({
  requestKey: z.uuid(), filename: z.string().trim().min(1).max(240)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  mediaType: z.string().max(160).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i),
  size: z.number().int().min(1).max(attachmentLimits.bytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type NativeUploadIntent = z.infer<typeof nativeUploadIntentSchema>;
