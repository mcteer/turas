import { artifactIntentCommandSchema } from "../../../../../../lib/contracts/artifacts";
import { failure } from "../../../../../../lib/contracts/http";
import { artifactId, artifactJson, artifactSession } from "../../../../../../lib/server/artifacts/http";
import { detachConversationArtifact } from "../../../../../../lib/server/artifacts/references";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; versionId: string }> };
export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await artifactSession(request, true);
    await artifactJson(request, artifactIntentCommandSchema);
    const { id,versionId } = await context.params;
    await detachConversationArtifact(actor, artifactId(id), artifactId(versionId));
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
