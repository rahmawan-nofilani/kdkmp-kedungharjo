import { getD1 } from "./context";

export const BACKUP_RECOVERY_VERSION = "backup_recovery_v11";

const SQL = `
CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  backup_number TEXT NOT NULL,
  format_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'ORGANIZATION' CHECK (scope IN ('ORGANIZATION')),
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED','VERIFIED','FAILED','ARCHIVED')),
  table_count INTEGER NOT NULL DEFAULT 0 CHECK (table_count >= 0),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  checksum_sha256 TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  verification_note TEXT,
  UNIQUE (organization_id, backup_number),
  UNIQUE (organization_id, checksum_sha256)
);
CREATE INDEX IF NOT EXISTS backup_runs_org_date_idx
  ON backup_runs (organization_id, generated_at DESC, status);

CREATE TABLE IF NOT EXISTS backup_restore_tests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  backup_run_id TEXT REFERENCES backup_runs(id) ON DELETE RESTRICT,
  backup_number TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PASSED','FAILED')),
  test_type TEXT NOT NULL DEFAULT 'PACKAGE_VALIDATION' CHECK (test_type IN ('PACKAGE_VALIDATION','RESTORE_SANDBOX')),
  detail TEXT,
  tested_by TEXT NOT NULL,
  tested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS backup_restore_tests_org_date_idx
  ON backup_restore_tests (organization_id, tested_at DESC, status);
`;

function statements(sql: string) {
  return sql.split(";").map((item) => item.trim()).filter(Boolean);
}

export async function applyBackupRecoveryV11() {
  const db = getD1();
  const existing = await db.prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(BACKUP_RECOVERY_VERSION).first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  const items = statements(SQL);
  let completed = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      await db.exec(`${items[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V11_STEP_${index + 1}: ${message}`);
    }
  }

  await db.prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(BACKUP_RECOVERY_VERSION).run();
  return { alreadyApplied: false, statements: completed + 1 };
}
