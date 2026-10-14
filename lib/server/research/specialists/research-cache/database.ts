import { database,ensureDatabase } from "../database";
export function cacheEnabled() { return process.env.RESEARCH_CACHE_ENABLED !== "false" && Boolean(process.env.DATABASE_URL); }
export async function evidenceDatabase() {
  if(!cacheEnabled()) throw new Error("Evidence caching requires the configured database");
  await ensureDatabase();
  return database();
}
