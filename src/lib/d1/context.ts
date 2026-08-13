import { getCloudflareContext } from "@opennextjs/cloudflare";

export type D1PreparedRunResult<T = Record<string, unknown>> = {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
};
export type D1PreparedAllResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta?: Record<string, unknown>;
};
export type D1PreparedLike = {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1PreparedAllResult<T>>;
  run<T = Record<string, unknown>>(): Promise<D1PreparedRunResult<T>>;
};
type NativeD1DatabaseLike = {
  prepare(query: string): D1PreparedLike;
  batch<T = Record<string, unknown>>(statements: D1PreparedLike[]): Promise<D1PreparedRunResult<T>[]>;
};
export type D1DatabaseLike = {
  prepare(query: string): D1PreparedLike;
  batch<T = Record<string, unknown>>(statements: D1PreparedLike[]): Promise<D1PreparedRunResult<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
};

export function getD1(): D1DatabaseLike {
  const context = getCloudflareContext();
  const env = context.env as unknown as { DB?: NativeD1DatabaseLike };
  if (!env.DB) throw new Error("D1 binding DB is not available");
  const nativeDb = env.DB;
  return {
    prepare(query: string) { return nativeDb.prepare(query); },
    batch<T = Record<string, unknown>>(statements: D1PreparedLike[]) { return nativeDb.batch<T>(statements); },
    async exec(query: string) {
      const result = await nativeDb.prepare(query).run();
      const rawDuration = result.meta?.duration;
      return { count: 1, duration: typeof rawDuration === "number" ? rawDuration : 0 };
    },
  };
}

export async function getD1SchemaStatus() {
  try {
    const db = getD1();
    const markerTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_schema_versions' LIMIT 1").first<{ name: string }>();
    if (!markerTable?.name) return { bound: true, initialized: false, current: false, currentVersion: null as string | null, pendingUpgrade: false };

    const versions = await db
      .prepare("SELECT version FROM app_schema_versions WHERE version IN ('transaction_core_v1','inventory_control_v2','procurement_v3','procurement_accounting_v4','accounting_config_v5')")
      .all<{ version: string }>();
    const applied = new Set(versions.results.map((row) => row.version));
    const coreReady = applied.has("transaction_core_v1");
    const inventoryReady = applied.has("inventory_control_v2");
    const procurementReady = applied.has("procurement_v3");
    const procurementAccountingReady = applied.has("procurement_accounting_v4");
    const accountingConfigReady = applied.has("accounting_config_v5");

    const currentVersion = accountingConfigReady
      ? "accounting_config_v5"
      : procurementAccountingReady
        ? "procurement_accounting_v4"
        : procurementReady
          ? "procurement_v3"
          : inventoryReady
            ? "inventory_control_v2"
            : coreReady
              ? "transaction_core_v1"
              : null;

    return {
      bound: true,
      initialized: coreReady,
      current: coreReady && inventoryReady && procurementReady && procurementAccountingReady && accountingConfigReady,
      currentVersion,
      pendingUpgrade: coreReady && (!inventoryReady || !procurementReady || !procurementAccountingReady || !accountingConfigReady),
    };
  } catch {
    return { bound: false, initialized: false, current: false, currentVersion: null as string | null, pendingUpgrade: false };
  }
}
