import { getD1 } from "./context";

export const ASSET_DEPRECIATION_VERSION = "asset_depreciation_v9";

const ASSET_SQL = `
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  asset_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  acquisition_date TEXT NOT NULL,
  in_service_date TEXT NOT NULL,
  acquisition_cost_amount INTEGER NOT NULL CHECK (acquisition_cost_amount > 0),
  residual_value_amount INTEGER NOT NULL DEFAULT 0 CHECK (residual_value_amount >= 0),
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
  depreciation_method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE')),
  asset_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  accumulated_depreciation_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  depreciation_expense_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','FULLY_DEPRECIATED','DISPOSED','CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  disposed_at TEXT,
  UNIQUE (organization_id, asset_code),
  CHECK (residual_value_amount < acquisition_cost_amount),
  CHECK (in_service_date >= acquisition_date)
);
CREATE INDEX IF NOT EXISTS fixed_assets_org_status_idx ON fixed_assets (organization_id, status, in_service_date, asset_code);

CREATE TABLE IF NOT EXISTS asset_depreciation_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_number TEXT NOT NULL,
  period_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  asset_count INTEGER NOT NULL DEFAULT 0 CHECK (asset_count >= 0),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  posted_at TEXT,
  cancelled_at TEXT,
  UNIQUE (organization_id, run_number),
  UNIQUE (organization_id, period_month)
);
CREATE INDEX IF NOT EXISTS asset_depreciation_runs_org_period_idx ON asset_depreciation_runs (organization_id, period_month DESC, status);

CREATE TABLE IF NOT EXISTS asset_depreciation_lines (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES asset_depreciation_runs(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE RESTRICT,
  depreciation_amount INTEGER NOT NULL CHECK (depreciation_amount > 0),
  accumulated_before_amount INTEGER NOT NULL DEFAULT 0 CHECK (accumulated_before_amount >= 0),
  accumulated_after_amount INTEGER NOT NULL DEFAULT 0 CHECK (accumulated_after_amount >= 0),
  book_value_before_amount INTEGER NOT NULL DEFAULT 0 CHECK (book_value_before_amount >= 0),
  book_value_after_amount INTEGER NOT NULL DEFAULT 0 CHECK (book_value_after_amount >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, asset_id)
);
CREATE INDEX IF NOT EXISTS asset_depreciation_lines_asset_idx ON asset_depreciation_lines (asset_id, run_id);
`;

const ASSET_APPROVER_GUARD = `
CREATE TRIGGER IF NOT EXISTS fixed_asset_maker_checker_guard
BEFORE UPDATE OF status ON fixed_assets
WHEN OLD.status='DRAFT' AND NEW.status='ACTIVE' AND NEW.approved_by = OLD.created_by
BEGIN
  SELECT RAISE(ABORT, 'ASSET_MAKER_CANNOT_APPROVE');
END;
`;

const DEPRECIATION_APPROVER_GUARD = `
CREATE TRIGGER IF NOT EXISTS asset_depreciation_maker_checker_guard
BEFORE UPDATE OF status ON asset_depreciation_runs
WHEN OLD.status='DRAFT' AND NEW.status='POSTED' AND NEW.approved_by = OLD.created_by
BEGIN
  SELECT RAISE(ABORT, 'DEPRECIATION_MAKER_CANNOT_APPROVE');
END;
`;

function statements(sql: string) {
  return sql.split(";").map((item) => item.trim()).filter(Boolean);
}

export async function applyAssetDepreciationV9() {
  const db = getD1();
  const existing = await db.prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(ASSET_DEPRECIATION_VERSION).first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  let completed = 0;
  const ddl = statements(ASSET_SQL);
  for (let index = 0; index < ddl.length; index += 1) {
    try {
      await db.exec(`${ddl[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V9_STEP_${index + 1}: ${message} | SQL: ${ddl[index].replace(/\s+/g," ").slice(0,110)}`);
    }
  }

  for (const trigger of [ASSET_APPROVER_GUARD, DEPRECIATION_APPROVER_GUARD]) {
    try {
      await db.exec(trigger);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V9_STEP_${completed + 1}: ${message} | SQL: CREATE asset control trigger`);
    }
  }

  await db.prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(ASSET_DEPRECIATION_VERSION).run();
  completed += 1;
  return { alreadyApplied: false, statements: completed };
}
