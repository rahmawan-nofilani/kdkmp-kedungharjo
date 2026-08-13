import { getD1 } from "./context";

export const ACCOUNTING_CONFIG_VERSION = "accounting_config_v5";

const ACCOUNTING_CONFIG_SQL = `
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
  parent_account_id TEXT REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS chart_of_accounts_org_status_idx ON chart_of_accounts (organization_id, status, code);

CREATE TABLE IF NOT EXISTS accounting_mappings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_code TEXT NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  current_approved_version INTEGER NOT NULL DEFAULT 0 CHECK (current_approved_version >= 0),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, event_code)
);
CREATE INDEX IF NOT EXISTS accounting_mappings_org_idx ON accounting_mappings (organization_id, status, event_code);

CREATE TABLE IF NOT EXISTS accounting_mapping_versions (
  id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL REFERENCES accounting_mappings(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  debit_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  credit_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','REJECTED','RETIRED')),
  change_note TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  rejected_at TEXT,
  UNIQUE (mapping_id, version)
);
CREATE INDEX IF NOT EXISTS accounting_mapping_versions_mapping_idx ON accounting_mapping_versions (mapping_id, status, version DESC);
`;

const MAPPING_MAKER_CHECKER_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS accounting_mapping_maker_checker
BEFORE UPDATE OF status ON accounting_mapping_versions
WHEN NEW.status = 'APPROVED'
 AND NEW.created_by = NEW.approved_by
 AND NEW.created_by <> 'SYSTEM_FOUNDATION'
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNTING_MAPPING_MAKER_CHECKER');
END;
`;

const APPROVED_MAPPING_IMMUTABLE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS accounting_mapping_approved_immutable
BEFORE UPDATE ON accounting_mapping_versions
WHEN OLD.status IN ('APPROVED','RETIRED')
 AND (
   NEW.version <> OLD.version OR
   NEW.debit_account_id <> OLD.debit_account_id OR
   NEW.credit_account_id <> OLD.credit_account_id OR
   COALESCE(NEW.change_note,'') <> COALESCE(OLD.change_note,'') OR
   NEW.created_by <> OLD.created_by
 )
BEGIN
  SELECT RAISE(ABORT, 'APPROVED_ACCOUNTING_MAPPING_IMMUTABLE');
END;
`;

const ACCOUNT_STATUS_GUARD_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS accounting_account_status_guard
BEFORE UPDATE OF status ON chart_of_accounts
WHEN NEW.status <> 'ACTIVE'
 AND EXISTS (
   SELECT 1
   FROM accounting_mapping_versions amv
   JOIN accounting_mappings am ON am.id = amv.mapping_id
   WHERE am.organization_id = NEW.organization_id
     AND amv.status = 'APPROVED'
     AND (amv.debit_account_id = NEW.id OR amv.credit_account_id = NEW.id)
 )
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNT_USED_BY_APPROVED_MAPPING');
END;
`;

function toStatements(sql: string) {
  return sql.split(";").map((statement) => statement.trim()).filter(Boolean);
}

export async function applyAccountingConfigV5() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(ACCOUNTING_CONFIG_VERSION)
    .first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  const statements = toStatements(ACCOUNTING_CONFIG_SQL);
  let completed = 0;
  for (let index = 0; index < statements.length; index += 1) {
    try {
      await db.exec(`${statements[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V5_STEP_${index + 1}: ${message} | SQL: ${statements[index].replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }

  const triggers = [
    MAPPING_MAKER_CHECKER_TRIGGER,
    APPROVED_MAPPING_IMMUTABLE_TRIGGER,
    ACCOUNT_STATUS_GUARD_TRIGGER,
  ];
  for (let index = 0; index < triggers.length; index += 1) {
    try {
      await db.exec(triggers[index]);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V5_STEP_${completed + 1}: ${message} | SQL: CREATE ACCOUNTING CONTROL TRIGGER ${index + 1}`);
    }
  }

  await db
    .prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(ACCOUNTING_CONFIG_VERSION)
    .run();
  completed += 1;

  return { alreadyApplied: false, statements: completed };
}
