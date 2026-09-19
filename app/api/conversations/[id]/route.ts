import { NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth/authorize";
import { updateConversation } from "@/lib/conversations/repository";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentity(request);
    const { id } = await params;
    const body = await request.json() as { title?: unknown; archived?: unknown; version?: unknown };
    if (!Number.isInteger(body.version) || (body.title !== undefined && (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 80)) || (body.archived !== undefined && typeof body.archived !== "boolean")) return NextResponse.json({ error: "Invalid conversation update." }, { status: 400 });
    const conversation = await updateConversation(identity, id, { title: typeof body.title === "string" ? body.title.trim() : undefined, archived: typeof body.archived === "boolean" ? body.archived : undefined, version: body.version as number });
    if (!conversation) return NextResponse.json({ error: "Conversation was not found or has changed." }, { status: 409 });
    return NextResponse.json({ conversation });
  } catch (error) { return error instanceof Response ? error : NextResponse.json({ error: "Unable to update conversation." }, { status: 500 }); }
}
