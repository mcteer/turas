import { createHmac } from "node:crypto";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig, type ServerConfig } from "../config";
import { query, withTransaction } from "../db/client";
import { appendAccessAudit } from "../access/audit";

const windowMs = 15 * 60 * 1_000;

export function loginBlocked(accountIpFailures: number, ipFailures: number): boolean {
  return accountIpFailures >= 5 || ipFailures >= 30;
}

function rateKey(value: string, config: ServerConfig): string {
  return createHmac("sha256", config.TURAS_MAINTENANCE_SECRET)
    .update("turas-login-rate-v1:").update(value).digest("hex");
}

function keys(username: string, clientAddress: string, config: ServerConfig) {
  return {
    accountIp: rateKey(`account:${username.toLowerCase()}:ip:${clientAddress}`, config),
    ip: rateKey(`ip:${clientAddress}`, config),
  };
}

function currentWindow(now = new Date()): { start: Date; expires: Date } {
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  return { start, expires: new Date(start.getTime() + windowMs) };
}

export async function checkLoginThrottle(username: string, clientAddress: string): Promise<void> {
  const config = getServerConfig();
  const { accountIp, ip } = keys(username, clientAddress, config);
  const { start, expires } = currentWindow();
  const result = await query<{ category: string; count: number }>(`
    SELECT category, count FROM rate_windows
    WHERE environment_id = $1 AND window_start = $2
      AND ((category = 'login_account_ip' AND key_hash = $3)
        OR (category = 'login_ip' AND key_hash = $4))
  `, [config.TURAS_ENVIRONMENT_ID, start, accountIp, ip]);
  const accountFailures = result.rows.find((row) => row.category === "login_account_ip")?.count ?? 0;
  const ipFailures = result.rows.find((row) => row.category === "login_ip")?.count ?? 0;
  if (loginBlocked(accountFailures, ipFailures)) {
    throw new HttpFailure(429, "rate_limited", "Try again later", (expires.getTime() - Date.now()) / 1_000);
  }
}

export async function recordFailedLogin(username: string, clientAddress: string): Promise<void> {
  const config = getServerConfig();
  const { accountIp, ip } = keys(username, clientAddress, config);
  const { start, expires } = currentWindow();
  await withTransaction(async (client) => {
    for (const [category, key] of [["login_account_ip", accountIp], ["login_ip", ip]]) {
      await client.query(`
        INSERT INTO rate_windows (environment_id, key_hash, category, window_start, count, expires_at)
        VALUES ($1, $2, $3, $4, 1, $5)
        ON CONFLICT (environment_id, key_hash, category, window_start)
        DO UPDATE SET count = rate_windows.count + 1
      `, [config.TURAS_ENVIRONMENT_ID, key, category, start, expires]);
    }
    await appendAccessAudit(client, { action: "login", outcome: "denied" });
  });
}

export function trustedLocalClientAddress(): string {
  // This local-only slice uses one host. Do not trust a caller-supplied IP header.
  return "local-host";
}
