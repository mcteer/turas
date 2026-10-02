import type { EveChannel } from "eve/channels/eve";
import { z } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { checkSessionCsrf } from "../auth/csrf";
import { getCurrentSession } from "../auth/sessions";
import { bindNativeSession, claimBinding, markBindingUncertain } from "./binding";
import { claimDispatch, getAttemptReceipt, markDispatchUncertain, normalizeMessageText, prepareAttempt, recordNativePreAdmissionRejection, recordNativeReceipt } from "./dispatch";
import { getOwnedConversationByNativeSession } from "./repository";
import { guardNativeStream } from "./stream";
import { requestCancellation } from "./cancel";
import { assertNativeContextCurrent, releaseNativeChunk } from "./context-fence";
import { artifactDraftSelectionSchema } from "../../contracts/artifacts";
import { authorizeNativeRetirement } from "../artifacts/native-retirement";

const createSchema = z.object({ operationId: z.uuid() }).strict();
const sendSchema = z.object({ message: z.string(),
  artifactSelections: z.array(artifactDraftSelectionSchema).max(5).optional() }).strict();
const nativeSessionSchema = z.object({ ok: z.literal(true), sessionId: z.string().min(1) }).passthrough();

function nativeFailure(error: unknown): Response {
  const known = error instanceof HttpFailure;
  if (!known) {
    const code = typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined;
    console.info(JSON.stringify({ kind: "turas_native_boundary_error",
      name: error instanceof Error ? error.name : "unknown", code }));
  }
  return Response.json({ ok: false, code: known ? error.code : "unavailable",
    error: known ? error.message : "Service unavailable" }, {
    status: known ? error.status : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function closed(): Response {
  return Response.json({ ok: false, code: "not_available", error: "Not available" }, {
    status: 403,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function composeEveRoutes(channel: EveChannel): EveChannel {
  return {
    ...channel,
    routes: channel.routes.map((route) => {
      if (route.method === "GET" && route.path === "/eve/v1/health") return route;
      // Installed eve exposes no WebSocket routes. A future upgrade must not
      // introduce a content path around the governed HTTP release wrapper.
      if (route.transport === "websocket") return { ...route, handler: async () => {
        throw new HttpFailure(403, "not_available", "Not available");
      } };
      if (route.method === "POST" && route.path === "/eve/v1/session") {
        const native = route.handler;
        return { ...route, handler: async (request, args) => {
          let claimToken: string | undefined;
          let session: Awaited<ReturnType<typeof getCurrentSession>> = null;
          let conversationId: string | undefined;
          try {
            session = await getCurrentSession(request);
            if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
            checkSessionCsrf(request, session);
            conversationId = request.headers.get("x-turas-conversation-id") ?? undefined;
            if (!z.uuid().safeParse(conversationId).success) {
              throw new HttpFailure(422, "invalid_input", "Invalid request");
            }
            const text = await request.text();
            if (Buffer.byteLength(text) > 32 * 1024) {
              throw new HttpFailure(413, "too_large", "Request too large");
            }
            let decoded: unknown;
            try { decoded = JSON.parse(text); }
            catch { throw new HttpFailure(422, "invalid_input", "Invalid request"); }
            const parsed = createSchema.safeParse(decoded);
            if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
            const claim = await claimBinding(session, conversationId!, parsed.data.operationId);
            if (claim.state === "bound") {
              return Response.json({ ok: true, sessionId: claim.eveSessionId, status: "accepted" }, {
                headers: { "Cache-Control": "private, no-store" },
              });
            }
            if (claim.state === "pending") {
              throw new HttpFailure(409, "turas_binding_pending", "Session binding pending");
            }
            claimToken = claim.claimToken;
            const headers = new Headers(request.headers);
            headers.delete("content-length");
            const nativeRequest = () => new Request(request.url, {
              method: "POST", headers, body: JSON.stringify({ operationId: claim.operationId }),
            });
            const started = Date.now();
            let previousId: string | null = null;
            let candidateResponse: Response | null = null;
            for (let attempt = 0; attempt < 5 && Date.now() - started < 20_000; attempt++) {
              candidateResponse = await native(nativeRequest(), args);
              if (!candidateResponse.ok) {
                await markBindingUncertain(session, conversationId!, claimToken);
                return candidateResponse;
              }
              const parsedNative = nativeSessionSchema.safeParse(await candidateResponse.clone().json());
              if (!parsedNative.success) throw new HttpFailure(503, "invalid_native_response", "Service unavailable");
              if (parsedNative.data.sessionId === previousId) {
                await bindNativeSession(session, conversationId!, claimToken, parsedNative.data.sessionId);
                return candidateResponse;
              }
              previousId = parsedNative.data.sessionId;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            throw new HttpFailure(409, "turas_binding_pending", "Session binding pending");
          } catch (error) {
            if (session && conversationId && claimToken) {
              try { await markBindingUncertain(session, conversationId, claimToken); }
              catch { /* leave the durable lease for reconciliation */ }
            }
            return nativeFailure(error);
          }
        } };
      }
      if (route.method === "POST" && route.path === "/eve/v1/session/:sessionId") {
        const native = route.handler;
        return { ...route, handler: async (request, args) => {
          let session: Awaited<ReturnType<typeof getCurrentSession>> = null;
          let conversationId: string | undefined;
          let attemptId: string | undefined;
          let dispatchClaimed = false;
          try {
            session = await getCurrentSession(request);
            if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
            checkSessionCsrf(request, session);
            conversationId = request.headers.get("x-turas-conversation-id") ?? undefined;
            const requestKey = request.headers.get("x-turas-request-key") ?? undefined;
            if (!z.uuid().safeParse(conversationId).success ||
                !z.uuid().safeParse(requestKey).success ||
                !/^wrun_[A-Za-z0-9_-]+$/.test(args.params.sessionId ?? "")) {
              throw new HttpFailure(422, "invalid_input", "Invalid request");
            }
            const raw = await request.text();
            if (Buffer.byteLength(raw) > 32 * 1024) {
              throw new HttpFailure(413, "too_large", "Request too large");
            }
            let decoded: unknown;
            try { decoded = JSON.parse(raw); }
            catch { throw new HttpFailure(422, "invalid_input", "Invalid request"); }
            const parsed = sendSchema.safeParse(decoded);
            if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
            const selectionHeader = request.headers.get("x-turas-artifact-selections");
            if (selectionHeader && parsed.data.artifactSelections) {
              throw new HttpFailure(422, "invalid_input", "Duplicate source selections");
            }
            let headerSelections: unknown = [];
            if (selectionHeader) {
              if (selectionHeader.length > 8_192) throw new HttpFailure(413,"too_large","Selections too large");
              try { headerSelections = JSON.parse(Buffer.from(selectionHeader,"base64url").toString("utf8")); }
              catch { throw new HttpFailure(422,"invalid_input","Invalid source selections"); }
            }
            const checkedSelections = z.array(artifactDraftSelectionSchema).max(5).safeParse(
              selectionHeader ? headerSelections : parsed.data.artifactSelections ?? []);
            if (!checkedSelections.success) throw new HttpFailure(422,"invalid_input","Invalid source selections");
            const selections = checkedSelections.data;
            const text = normalizeMessageText(parsed.data.message.trim() || (selections.length ?
              "Please discuss the selected customer source passages." : ""));
            const prepared = await prepareAttempt(session, conversationId!, args.params.sessionId,
              requestKey!, text, selections);
            attemptId = prepared.attemptId;
            if (!prepared.created && prepared.dispatchState !== "prepared") {
              const receipt = await getAttemptReceipt(session, conversationId!, attemptId);
              if (receipt) return receipt;
              throw new HttpFailure(409, "turas_dispatch_pending", "Dispatch outcome pending");
            }
            let tailIndex: number;
            try {
              tailIndex = await args.attachSession(args.params.sessionId).getStreamTailIndex();
            } catch {
              throw new HttpFailure(503, "native_tail_unavailable", "Service unavailable");
            }
            if (!Number.isSafeInteger(tailIndex) || tailIndex < -1) {
              throw new HttpFailure(503, "native_tail_unavailable", "Service unavailable");
            }
            try { await claimDispatch(session, conversationId!, attemptId, tailIndex + 1); }
            catch (error) {
              if (error instanceof HttpFailure) throw error;
              throw new HttpFailure(503, "dispatch_persist_failed", "Service unavailable");
            }
            dispatchClaimed = true;
            const headers = new Headers(request.headers);
            headers.delete("content-length");
            headers.delete("x-turas-artifact-selections");
            let nativeResponse: Response | undefined;
            const started = Date.now();
            const dispatches = prepared.staffing ? 1 : 5;
            for (let retry = 0; retry < dispatches && Date.now() - started < 20_000; retry++) {
              nativeResponse = await native(new Request(request.url, {
                method: "POST", headers, body: JSON.stringify({ message: text }),
              }), args);
              if (nativeResponse.status !== 409) break;
              let rejection: unknown;
              try { rejection = await nativeResponse.clone().json(); } catch { /* uncertain */ }
              if (typeof rejection !== "object" || rejection === null ||
                  !("code" in rejection) || rejection.code !== "session_not_ready") break;
              if (retry + 1 < dispatches) await new Promise((resolve) => setTimeout(resolve, 1_000));
            }
            if (!nativeResponse) throw new HttpFailure(503, "native_unavailable", "Service unavailable");
            if (!nativeResponse.ok) {
              if (nativeResponse.status === 409) {
                let rejection: unknown;
                try { rejection = await nativeResponse.clone().json(); } catch { /* uncertain */ }
                if (typeof rejection === "object" && rejection !== null &&
                    "code" in rejection && rejection.code === "session_not_ready") {
                  await recordNativePreAdmissionRejection(session, conversationId!, attemptId, nativeResponse);
                  if (prepared.staffing) return nativeFailure(new HttpFailure(409, "staffing_native_rejected", "Native admission was rejected; no request was resent"));
                  return nativeResponse;
                }
              }
              await markDispatchUncertain(session, conversationId!, attemptId, "native_rejection");
              if (prepared.staffing) return nativeFailure(new HttpFailure(409, "staffing_native_unconfirmed", "Native dispatch is unconfirmed; no request was resent"));
              return nativeResponse;
            }
            await recordNativeReceipt(session, conversationId!, attemptId, nativeResponse);
            return nativeResponse;
          } catch (error) {
            if (dispatchClaimed && session && conversationId && attemptId) {
              try { await markDispatchUncertain(session, conversationId, attemptId); }
              catch { /* durable claim remains blocked */ }
            }
            return nativeFailure(error);
          }
        } };
      }
      if (route.method === "GET" && route.path === "/eve/v1/session/:sessionId/stream") {
        const native = route.handler;
        return { ...route, handler: async (request, args) => {
          try {
            const current = await getCurrentSession(request);
            if (!current) throw new HttpFailure(401, "authentication_required", "Sign in required");
            await getOwnedConversationByNativeSession(current, args.params.sessionId);
            await assertNativeContextCurrent(current, args.params.sessionId);
            const response = await native(request, args);
            if (!response.ok) return response;
            return guardNativeStream(response, async () => {
              const refreshed = await getCurrentSession(request);
              if (!refreshed) return false;
              await getOwnedConversationByNativeSession(refreshed, args.params.sessionId);
              await assertNativeContextCurrent(refreshed, args.params.sessionId);
              return true;
            }, 10_000, 15_000, async (_chunk, enqueue) => {
              const refreshed = await getCurrentSession(request);
              if (!refreshed) throw hiddenRecord();
              await releaseNativeChunk(refreshed, args.params.sessionId, enqueue);
            });
          } catch (error) {
            return nativeFailure(error);
          }
        } };
      }
      if (route.method === "POST" && route.path === "/eve/v1/session/:sessionId/cancel") {
        const native = route.handler;
        return { ...route, handler: async (request, args) => {
          try {
            const session = await getCurrentSession(request);
            if (!session) throw new HttpFailure(401, "authentication_required", "Sign in required");
            checkSessionCsrf(request, session);
            const raw = await request.text();
            if (Buffer.byteLength(raw) > 32 * 1024) {
              throw new HttpFailure(413, "too_large", "Request too large");
            }
            let decoded: unknown;
            try { decoded = JSON.parse(raw); }
            catch { throw new HttpFailure(422, "invalid_input", "Invalid request"); }
            const parsed = z.object({ turnId: z.string().min(1).max(200) }).strict().safeParse(decoded);
            if (!parsed.success) throw new HttpFailure(422, "invalid_input", "Invalid request");
            await requestCancellation(session, args.params.sessionId, parsed.data.turnId);
            const headers = new Headers(request.headers);
            headers.delete("content-length");
            return native(new Request(request.url, {
              method: "POST", headers, body: JSON.stringify({ turnId: parsed.data.turnId }),
            }), args);
          } catch (error) {
            return nativeFailure(error);
          }
        } };
      }
      if (route.method === "POST" && route.path === "/eve/v1/session/:sessionId/reset") {
        const native = route.handler;
        return { ...route, handler: async (request, args) => {
          try {
            const sessionId = args.params.sessionId;
            if (!sessionId || !/^wrun_[A-Za-z0-9_-]+$/.test(sessionId) ||
                !await authorizeNativeRetirement(request,sessionId)) return closed();
            return native(request,args);
          } catch (error) { return nativeFailure(error); }
        } };
      }
      return { ...route, handler: async () => closed() };
    }),
  };
}
