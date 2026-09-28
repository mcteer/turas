import { z } from "zod";
import { failure, HttpFailure, success } from "../../../lib/contracts/http";
import { artifactSession } from "../../../lib/server/artifacts/http";
import { listOwnedArtifactSources } from "../../../lib/server/artifacts/read";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await artifactSession(request,false);
    const id = z.uuid().safeParse(new URL(request.url).searchParams.get("customerId"));
    if (!id.success) throw new HttpFailure(422,"invalid_query","Invalid customer");
    return success(await listOwnedArtifactSources(actor,id.data));
  } catch (error) { return failure(error); }
}
