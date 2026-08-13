import { initializeTransactionCore } from "./bootstrap";
import { getD1 } from "./context";

export const INVENTORY_CONTROL_VERSION = "inventory_control_v2";

const INVENTORY_CONTROL_SQL = `
CREATE TABLE IF NOT EXISTS inventory_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  min_stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
  reorder_qty INTEGER NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
  expiry_warning_days INTEGER NOT NULL DEFAULT 30 CHECK (expiry_warning_days >= 0),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, warehouse_id, product_id)
);
CREATE INDEX IF NOT EXISTS inventory_policies_org_idx ON inventory_policies (organization_id, warehouse_id, product_id);

CREATE TABLE IF NOT EXISTS stock_opname_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  session_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COUNTING','COUNTED','APPROVED','POSTED','CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  counted_by TEXT,
  approved_by TEXT,
  posted_by TEXT,
  created_at TEXT NOT NULL,
  counted_at TEXT,
  approved_at TEXT,
  posted_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, session_number)
);
CREATE INDEX IF NOT EXISTS stock_opname_sessions_org_status_idx ON stock_opname_sessions (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_opname_lines (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES stock_opname_sessions(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  system_qty INTEGER NOT NULL,
  physical_qty INTEGER,
  variance_qty INTEGER,
  unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  reason_text TEXT,
  evidence_reference TEXT,
  adjustment_movement_id TEXT REFERENCES inventory_movements(id) ON DELETE RESTRICT,
  counted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (session_id, product_id)
);
CREATE INDEX IF NOT EXISTS stock_opname_lines_session_idx ON stock_opname_lines (session_id, product_id);

INSERT OR IGNORE INTO app_schema_versions (version, applied_at)
VALUES ('inventory_control_v2', datetime('now'));
`;

function toStatements(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function applyInventoryControlV2() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version = ? LIMIT 1")
    .bind(INVENTORY_CONTROL_VERSION)
    .first<{ version: string }>();

  if (existing?.version) {
    return { alreadyApplied: true, statements: 0 };
  }

  const statements = toStatements(INVENTORY_CONTROL_SQL);
  let completed = 0;

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    try {
      await db.exec(`${statement};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const operation = statement.replace(/\s+/g, " ").slice(0, 100);
      throw new Error(`D1_UPGRADE_V2_STEP_${index + 1}: ${message} | SQL: ${operation}`);
    }
  }

  return { alreadyApplied: false, statements: completed };
}

export async function applyPendingD1Migrations() {
  const core = await initializeTransactionCore();
  const inventory = await applyInventoryControlV2();

  return {
    initialized: true,
    alreadyInitialized: core.alreadyInitialized && inventory.alreadyApplied,
    statements: core.statements + inventory.statements,
    currentVersion: INVENTORY_CONTROL_VERSION,
  };
}
