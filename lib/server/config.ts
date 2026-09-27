import { z } from "zod";

const credential = z.string().min(1);
const databaseUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.slice(1));
}, "A Postgres database URL is required");

const schema = z.object({
  DATABASE_URL: databaseUrl,
  DATABASE_URL_UNPOOLED: databaseUrl,
  TURAS_ENVIRONMENT_ID: z.string().min(1),
  TURAS_APP_ORIGIN: z.string().url().refine((value) => new URL(value).origin === value, "An exact application origin is required"),
  TURAS_DEMO_USERNAME: z.literal("mcteer"),
  TURAS_DEMO_PASSWORD: credential,
  PANEL_USERNAME: z.literal("panel"),
  PANEL_PASSWORD: credential,
  PARTNER_USERNAME: z.literal("partner"),
  PARTNER_PASSWORD: credential,
  TURAS_MAINTENANCE_SECRET: z.string().min(32),
});

export type ServerConfig = z.infer<typeof schema>;

export function parseServerConfig(environment: Record<string, string | undefined>): ServerConfig {
  if (typeof window !== "undefined") throw new Error("Server configuration cannot run in a browser");
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
    throw new Error(`Turas configuration invalid: ${[...new Set(names)].join(", ")}`);
  }
  return parsed.data;
}

export function getServerConfig(): ServerConfig {
  return parseServerConfig(process.env);
}
