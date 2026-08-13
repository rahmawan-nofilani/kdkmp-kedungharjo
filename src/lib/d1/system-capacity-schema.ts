import { getD1 } from "./context";

export const SYSTEM_CAPACITY_VERSION = "system_capacity_v10";

const SQL = `
CREATE TABLE IF NOT EXISTS system_capacity_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  d1_bytes INTEGER,
  supabase_bytes INTEGER,
  member_count INTEGER NOT NULL DEFAULT 0,
  sales_30d INTEGER NOT NULL DEFAULT 0,
  sales_total INTEGER NOT NULL DEFAULT 0,
  journal_entries_total INTEGER NOT NULL DEFAULT 0,
  inventory_movements_total INTEGER NOT NULL DEFAULT 0,
  audit_events_total INTEGER NOT NULL DEFAULT 0,
  captured_by TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','AUTO')),
  captured_at TEXT NOT NULL,
  UNIQUE (organization_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS system_capacity_snapshots_org_date_idx
  ON system_capacity_snapshots (organization_id, snapshot_date DESC);
`;

function statements(sql: string) {
  return sql.split(";").map((item) => item.trim()).filter(Boolean);
}

export async function applySystemCapacityV10() {
  const db = getD1();
  const existing = await db.prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(SYSTEM_CAPACITY_VERSION).first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  const items = statements(SQL);
  let completed = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      await db.exec(`${items[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V10_STEP_${index + 1}: ${message}`);
    }
  }

  await db.prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(SYSTEM_CAPACITY_VERSION).run();
  return { alreadyApplied: false, statements: completed + 1 };
}
