import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1PreparedLike = {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results?: T[];
    meta?: Record<string, unknown>;
  }>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedLike;
  exec(query: string): Promise<{ count: number; duration: number }>;
};

export function getD1(): D1DatabaseLike {
  const context = getCloudflareContext();
  const env = context.env as unknown as { DB?: D1DatabaseLike };

  if (!env.DB) {
    throw new Error("D1 binding DB is not available");
  }

  return env.DB;
}

export async function getD1SchemaStatus() {
  try {
    const db = getD1();
    const markerTable = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_schema_versions' LIMIT 1")
      .first<{ name: string }>();

    if (!markerTable?.name) {
      return { bound: true, initialized: false };
    }

    const marker = await db
      .prepare("SELECT version FROM app_schema_versions WHERE version='transaction_core_v1' LIMIT 1")
      .first<{ version: string }>();

    return {
      bound: true,
      initialized: Boolean(marker?.version),
    };
  } catch {
    return {
      bound: false,
      initialized: false,
    };
  }
}
