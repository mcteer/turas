import { NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth/authorize";
import { bindEveSession } from "@/lib/conversations/repository";
export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as { id?: unknown; eveSessionId?: unknown };
    if (typeof body.id !== "string" || typeof body.eveSessionId !== "string") return NextResponse.json({ error: "Invalid binding." }, { status: 400 });
    return NextResponse.json({ ok: await bindEveSession(identity, body.id, body.eveSessionId) });
  } catch (error) { return error instanceof Response ? error : NextResponse.json({ error: "Unable to bind conversation." }, { status: 500 }); }
}
