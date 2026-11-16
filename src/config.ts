import crypto from "node:crypto";
import path from "node:path";

export interface KoralConfig {
  host: string;
  port: number;
  jwtSecret: string;
  dataDir: string;
  maxUploadBytes: number;
  rateLimitMax: number;
}

export function loadConfig(overrides: Partial<KoralConfig> = {}): KoralConfig {
  const dataDir = overrides.dataDir ?? process.env.KORAL_DATA_DIR ?? "./data";
  const jwtSecret =
    overrides.jwtSecret ??
    process.env.KORAL_JWT_SECRET ??
    crypto.randomBytes(32).toString("hex");

  return {
    host: overrides.host ?? process.env.KORAL_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.KORAL_PORT ?? 3000),
    jwtSecret,
    dataDir: path.resolve(dataDir),
    maxUploadBytes:
      overrides.maxUploadBytes ??
      Number(process.env.KORAL_MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
    rateLimitMax:
      overrides.rateLimitMax ?? Number(process.env.KORAL_RATE_LIMIT_MAX ?? 120),
  };
}
