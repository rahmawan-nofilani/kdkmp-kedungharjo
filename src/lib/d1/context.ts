import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1PreparedRunResult<T = Record<string, unknown>> = {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
};

type D1PreparedLike = {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1PreparedRunResult<T>>;
};

type NativeD1DatabaseLike = {
  prepare(query: string): D1PreparedLike;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedLike;
  exec(query: string): Promise<{ count: number; duration: number }>;
};

export function getD1(): D1DatabaseLike {
  const context = getCloudflareContext();
  const env = context.env as unknown as { DB?: NativeD1DatabaseLike };

  if (!env.DB) {
    throw new Error("D1 binding DB is not available");
  }

  const nativeDb = env.DB;

  return {
    prepare(query: string) {
      return nativeDb.prepare(query);
    },
    async exec(query: string) {
      // Native D1 exec treats newlines as query separators. Our bootstrap sends
      // one complete SQL statement at a time, and CREATE TABLE statements are
      // intentionally formatted across multiple lines. PreparedStatement.run()
      // executes that multiline statement as one unit.
      const result = await nativeDb.prepare(query).run();
      const rawDuration = result.meta?.duration;
      const duration = typeof rawDuration === "number" ? rawDuration : 0;
      return { count: 1, duration };
    },
  };
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
