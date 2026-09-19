import { NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth/authorize";
import { createConversation, listConversations } from "@/lib/conversations/repository";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const url = new URL(request.url);
    const conversations = await listConversations(identity, { query: url.searchParams.get("q")?.slice(0, 100), archived: url.searchParams.get("archived") === "true" });
    return NextResponse.json({ conversations }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return error instanceof Response ? error : NextResponse.json({ error: "Unable to load conversations." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const body = await request.json() as { firstMessage?: unknown; eveSessionId?: unknown };
    if (typeof body.firstMessage !== "string" || body.firstMessage.trim().length === 0 || body.firstMessage.length > 10_000) return NextResponse.json({ error: "A first message is required." }, { status: 400 });
    if (body.eveSessionId !== undefined && (typeof body.eveSessionId !== "string" || body.eveSessionId.length > 200)) return NextResponse.json({ error: "Invalid session reference." }, { status: 400 });
    return NextResponse.json({ conversation: await createConversation(identity, body.firstMessage, body.eveSessionId) }, { status: 201 });
  } catch (error) { return error instanceof Response ? error : NextResponse.json({ error: "Unable to create conversation." }, { status: 500 }); }
}
