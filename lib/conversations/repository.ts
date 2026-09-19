import { randomUUID } from "node:crypto";
import { database, ensureDatabase } from "@/lib/db/client";
import type { AppIdentity } from "@/lib/auth/session";

export type Conversation = {
  id: string;
  eveSessionId: string | null;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  archivedAt: string | null;
  version: number;
};

const localConversations = new Map<string, Conversation & { environmentId: string; workspaceId: string; ownerUserId: string }>();
const titleFromMessage = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 80) || "New conversation";

function scoped(identity: AppIdentity, conversation: { environmentId: string; workspaceId: string; ownerUserId: string }) {
  return conversation.environmentId === identity.environmentId && conversation.workspaceId === identity.workspaceId && conversation.ownerUserId === identity.userId;
}

export async function listConversations(identity: AppIdentity, options: { query?: string; archived?: boolean } = {}) {
  const query = database();
  if (query) {
    await ensureDatabase();
    const rows = await query.query(`SELECT id, eve_session_id, title, created_at, last_message_at, archived_at, version
      FROM turas_conversations WHERE environment_id = $1 AND workspace_id = $2 AND owner_user_id = $3
      AND ($4::boolean = (archived_at IS NOT NULL)) AND ($5::text = '' OR title ILIKE '%' || $5 || '%')
      ORDER BY last_message_at DESC, id DESC LIMIT 30`, [identity.environmentId, identity.workspaceId, identity.userId, options.archived ?? false, options.query ?? ""]);
    return rows.map(rowToConversation);
  }
  return [...localConversations.values()].filter((conversation) => scoped(identity, conversation) && Boolean(conversation.archivedAt) === Boolean(options.archived) && (!options.query || conversation.title.toLowerCase().includes(options.query.toLowerCase()))).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).map(stripLocal);
}

export async function createConversation(identity: AppIdentity, firstMessage: string, eveSessionId?: string) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const conversation = { id, eveSessionId: eveSessionId ?? null, title: titleFromMessage(firstMessage), createdAt: now, lastMessageAt: now, archivedAt: null, version: 1 };
  const query = database();
  if (query) {
    await ensureDatabase();
    await query.query(`INSERT INTO turas_conversations (id, environment_id, workspace_id, owner_user_id, eve_session_id, title, created_at, last_message_at, version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, identity.environmentId, identity.workspaceId, identity.userId, conversation.eveSessionId, conversation.title, now, now, 1]);
  } else localConversations.set(id, { ...conversation, environmentId: identity.environmentId, workspaceId: identity.workspaceId, ownerUserId: identity.userId });
  return conversation;
}

export async function bindEveSession(identity: AppIdentity, id: string, eveSessionId: string) {
  const query = database();
  if (query) {
    await ensureDatabase();
    const rows = await query.query(`UPDATE turas_conversations SET eve_session_id = $1, last_message_at = now(), version = version + 1 WHERE id = $2 AND environment_id = $3 AND workspace_id = $4 AND owner_user_id = $5 RETURNING id`, [eveSessionId, id, identity.environmentId, identity.workspaceId, identity.userId]);
    return rows.length > 0;
  }
  const conversation = localConversations.get(id);
  if (!conversation || !scoped(identity, conversation)) return false;
  conversation.eveSessionId = eveSessionId; conversation.lastMessageAt = new Date().toISOString(); conversation.version += 1;
  return true;
}

export async function getConversationBySession(identity: AppIdentity, eveSessionId: string) {
  const query = database();
  if (query) {
    await ensureDatabase();
    const rows = await query.query(`SELECT id, eve_session_id, title, created_at, last_message_at, archived_at, version FROM turas_conversations WHERE eve_session_id = $1 AND environment_id = $2 AND workspace_id = $3 AND owner_user_id = $4`, [eveSessionId, identity.environmentId, identity.workspaceId, identity.userId]);
    return rows[0] ? rowToConversation(rows[0]) : null;
  }
  return [...localConversations.values()].find((conversation) => conversation.eveSessionId === eveSessionId && scoped(identity, conversation)) ?? null;
}

export async function updateConversation(identity: AppIdentity, id: string, patch: { title?: string; archived?: boolean; version: number }) {
  const query = database();
  if (query) {
    await ensureDatabase();
    const rows = await query.query(`UPDATE turas_conversations SET title = COALESCE($1, title), archived_at = CASE WHEN $2::boolean THEN COALESCE(archived_at, now()) ELSE CASE WHEN $3::boolean THEN NULL ELSE archived_at END END, version = version + 1 WHERE id = $4 AND environment_id = $5 AND workspace_id = $6 AND owner_user_id = $7 AND version = $8 RETURNING id, eve_session_id, title, created_at, last_message_at, archived_at, version`, [patch.title ?? null, patch.archived === true, patch.archived === false, id, identity.environmentId, identity.workspaceId, identity.userId, patch.version]);
    return rows[0] ? rowToConversation(rows[0]) : null;
  }
  const conversation = localConversations.get(id);
  if (!conversation || !scoped(identity, conversation) || conversation.version !== patch.version) return null;
  if (patch.title !== undefined) conversation.title = patch.title;
  if (patch.archived !== undefined) conversation.archivedAt = patch.archived ? new Date().toISOString() : null;
  conversation.version += 1;
  return stripLocal(conversation);
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return { id: String(row.id), eveSessionId: row.eve_session_id ? String(row.eve_session_id) : null, title: String(row.title), createdAt: new Date(String(row.created_at)).toISOString(), lastMessageAt: new Date(String(row.last_message_at)).toISOString(), archivedAt: row.archived_at ? new Date(String(row.archived_at)).toISOString() : null, version: Number(row.version) };
}
function stripLocal(conversation: Conversation) { const { id, eveSessionId, title, createdAt, lastMessageAt, archivedAt, version } = conversation; return { id, eveSessionId, title, createdAt, lastMessageAt, archivedAt, version }; }
