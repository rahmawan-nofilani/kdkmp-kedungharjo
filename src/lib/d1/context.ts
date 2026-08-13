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

const EMPTY_FEATURES = {
  transactionCore: false,
  inventoryControl: false,
  procurement: false,
  procurementAccounting: false,
  accountingConfig: false,
  accountingRuntime: false,
  treasuryPeriod: false,
  controlledJournal: false,
  assetDepreciation: false,
  systemCapacity: false,
  backupRecovery: false,
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
    if (!markerTable?.name) {
      return {
        bound: true,
        initialized: false,
        current: false,
        currentVersion: null as string | null,
        pendingUpgrade: false,
        features: { ...EMPTY_FEATURES },
      };
    }

    const versions = await db
      .prepare("SELECT version FROM app_schema_versions WHERE version IN ('transaction_core_v1','inventory_control_v2','procurement_v3','procurement_accounting_v4','accounting_config_v5','accounting_runtime_v6','treasury_period_v7','controlled_journal_v8','asset_depreciation_v9','system_capacity_v10','backup_recovery_v11')")
      .all<{ version: string }>();
    const applied = new Set(versions.results.map((row) => row.version));
    const coreReady = applied.has("transaction_core_v1");
    const inventoryReady = applied.has("inventory_control_v2");
    const procurementReady = applied.has("procurement_v3");
    const procurementAccountingReady = applied.has("procurement_accounting_v4");
    const accountingConfigReady = applied.has("accounting_config_v5");
    const accountingRuntimeReady = applied.has("accounting_runtime_v6");
    const treasuryPeriodReady = applied.has("treasury_period_v7");
    const controlledJournalReady = applied.has("controlled_journal_v8");
    const assetDepreciationReady = applied.has("asset_depreciation_v9");
    const systemCapacityReady = applied.has("system_capacity_v10");
    const backupRecoveryReady = applied.has("backup_recovery_v11");

    const currentVersion = backupRecoveryReady
      ? "backup_recovery_v11"
      : systemCapacityReady
        ? "system_capacity_v10"
        : assetDepreciationReady
          ? "asset_depreciation_v9"
          : controlledJournalReady
            ? "controlled_journal_v8"
            : treasuryPeriodReady
              ? "treasury_period_v7"
              : accountingRuntimeReady
                ? "accounting_runtime_v6"
                : accountingConfigReady
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
      current:
        coreReady && inventoryReady && procurementReady && procurementAccountingReady &&
        accountingConfigReady && accountingRuntimeReady && treasuryPeriodReady && controlledJournalReady &&
        assetDepreciationReady && systemCapacityReady && backupRecoveryReady,
      currentVersion,
      pendingUpgrade:
        coreReady &&
        (!inventoryReady || !procurementReady || !procurementAccountingReady || !accountingConfigReady ||
          !accountingRuntimeReady || !treasuryPeriodReady || !controlledJournalReady || !assetDepreciationReady ||
          !systemCapacityReady || !backupRecoveryReady),
      features: {
        transactionCore: coreReady,
        inventoryControl: inventoryReady,
        procurement: procurementReady,
        procurementAccounting: procurementAccountingReady,
        accountingConfig: accountingConfigReady,
        accountingRuntime: accountingRuntimeReady,
        treasuryPeriod: treasuryPeriodReady,
        controlledJournal: controlledJournalReady,
        assetDepreciation: assetDepreciationReady,
        systemCapacity: systemCapacityReady,
        backupRecovery: backupRecoveryReady,
      },
    };
  } catch {
    return {
      bound: false,
      initialized: false,
      current: false,
      currentVersion: null as string | null,
      pendingUpgrade: false,
      features: { ...EMPTY_FEATURES },
    };
  }
}
