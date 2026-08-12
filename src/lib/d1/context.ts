import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1PreparedLike = {
  first<T = Record<string, unknown>>(): Promise<T | null>;
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
    const products = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
      .first<{ name: string }>();

    return {
      bound: true,
      initialized: Boolean(products?.name),
    };
  } catch {
    return {
      bound: false,
      initialized: false,
    };
  }
}
