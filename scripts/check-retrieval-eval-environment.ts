import { getServerConfig } from "../lib/server/config";
import { withRetrievalEvalEnvironment } from "./retrieval-eval-environment";

if (process.argv.slice(2).join(" ") !== "--disposable") {
  throw new Error("Use --disposable for the isolated 005 evaluation check");
}
await withRetrievalEvalEnvironment(async () => {
  const origin = getServerConfig().TURAS_APP_ORIGIN;
  const [auth,eve] = await Promise.all([
    fetch(`${origin}/api/auth/session`),fetch(`${origin}/eve/v1/health`),
  ]);
  if (auth.status !== 401 || !eve.ok) throw new Error("Isolated evaluation unhealthy");
  console.log(JSON.stringify({ isolated: true,disposable: true,
    appReady: true,nativeReady: true,selectedResourcesTouched: false }));
});
