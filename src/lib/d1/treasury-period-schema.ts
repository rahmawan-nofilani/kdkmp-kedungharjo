import { getD1 } from "./context";

export const TREASURY_PERIOD_VERSION = "treasury_period_v7";

const TREASURY_PERIOD_SQL = `
CREATE TABLE IF NOT EXISTS treasury_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('CASH','BANK')),
  chart_account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  bank_name TEXT,
  account_reference TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS treasury_accounts_org_idx ON treasury_accounts (organization_id, status, account_type, code);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_default_type_uq
  ON treasury_accounts (organization_id, account_type)
  WHERE is_default = 1 AND status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('INCOME','EXPENSE','TRANSFER_IN','TRANSFER_OUT')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  counterpart_account_id TEXT REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  reference_number TEXT,
  transfer_group_id TEXT,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','REVERSED')),
  posted_by TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  reversed_by TEXT,
  reversed_at TEXT,
  reversal_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, transaction_number)
);
CREATE INDEX IF NOT EXISTS treasury_transactions_account_idx ON treasury_transactions (organization_id, treasury_account_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS treasury_transactions_transfer_idx ON treasury_transactions (organization_id, transfer_group_id) WHERE transfer_group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  period_code TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
  created_by TEXT NOT NULL,
  closed_by TEXT,
  closed_at TEXT,
  close_note TEXT,
  reopened_by TEXT,
  reopened_at TEXT,
  reopen_note TEXT,
  locked_by TEXT,
  locked_at TEXT,
  lock_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (period_start <= period_end),
  UNIQUE (organization_id, period_code),
  UNIQUE (organization_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS accounting_periods_org_status_idx ON accounting_periods (organization_id, status, period_start DESC);

CREATE TABLE IF NOT EXISTS bank_reconciliation_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
  reconciliation_number TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  statement_closing_balance INTEGER NOT NULL,
  system_closing_balance INTEGER NOT NULL,
  difference_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RECONCILED','CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  reconciled_by TEXT,
  reconciled_at TEXT,
  cancelled_by TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (period_start <= period_end),
  UNIQUE (organization_id, reconciliation_number)
);
CREATE INDEX IF NOT EXISTS bank_reconciliation_sessions_org_idx ON bank_reconciliation_sessions (organization_id, treasury_account_id, status, period_end DESC);

CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES bank_reconciliation_sessions(id) ON DELETE RESTRICT,
  journal_line_id TEXT NOT NULL REFERENCES journal_lines(id) ON DELETE RESTRICT,
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0,1)),
  match_note TEXT,
  matched_by TEXT,
  matched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (session_id, journal_line_id)
);
CREATE INDEX IF NOT EXISTS bank_reconciliation_items_session_idx ON bank_reconciliation_items (session_id, matched, journal_line_id);
`;

const PERIOD_NO_OVERLAP_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS accounting_period_no_overlap
BEFORE INSERT ON accounting_periods
WHEN EXISTS (
  SELECT 1 FROM accounting_periods ap
  WHERE ap.organization_id = NEW.organization_id
    AND NEW.period_start <= ap.period_end
    AND NEW.period_end >= ap.period_start
)
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNTING_PERIOD_OVERLAP');
END;
`;

const PERIOD_BOUNDARY_IMMUTABLE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS accounting_period_boundary_immutable
BEFORE UPDATE OF period_code, period_start, period_end ON accounting_periods
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNTING_PERIOD_BOUNDARY_IMMUTABLE');
END;
`;

const PERIOD_LOCK_IMMUTABLE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS accounting_period_lock_immutable
BEFORE UPDATE OF status ON accounting_periods
WHEN OLD.status = 'LOCKED' AND NEW.status <> 'LOCKED'
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNTING_PERIOD_LOCKED');
END;
`;

const JOURNAL_PERIOD_INSERT_GUARD = `
CREATE TRIGGER IF NOT EXISTS journal_period_insert_guard
BEFORE INSERT ON journal_entries
WHEN NEW.status = 'POSTED'
 AND EXISTS (
   SELECT 1 FROM accounting_periods ap
   WHERE ap.organization_id = NEW.organization_id
     AND date(NEW.posted_at, '+7 hours') BETWEEN ap.period_start AND ap.period_end
     AND ap.status IN ('CLOSED','LOCKED')
 )
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNTING_PERIOD_CLOSED');
END;
`;

const JOURNAL_PERIOD_UPDATE_GUARD = `
CREATE TRIGGER IF NOT EXISTS journal_period_update_guard
BEFORE UPDATE OF status, posted_at ON journal_entries
WHEN NEW.status = 'POSTED'
 AND EXISTS (
   SELECT 1 FROM accounting_periods ap
   WHERE ap.organization_id = NEW.organization_id
     AND date(NEW.posted_at, '+7 hours') BETWEEN ap.period_start AND ap.period_end
     AND ap.status IN ('CLOSED','LOCKED')
 )
BEGIN
  SELECT RAISE(ABORT, 'ACCOUNTING_PERIOD_CLOSED');
END;
`;

function statements(sql: string) {
  return sql.split(";").map((item) => item.trim()).filter(Boolean);
}

export async function applyTreasuryPeriodV7() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(TREASURY_PERIOD_VERSION)
    .first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  let completed = 0;
  const ddl = statements(TREASURY_PERIOD_SQL);
  for (let index = 0; index < ddl.length; index += 1) {
    try {
      await db.exec(`${ddl[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V7_STEP_${index + 1}: ${message} | SQL: ${ddl[index].replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }

  const triggers = [
    PERIOD_NO_OVERLAP_TRIGGER,
    PERIOD_BOUNDARY_IMMUTABLE_TRIGGER,
    PERIOD_LOCK_IMMUTABLE_TRIGGER,
    JOURNAL_PERIOD_INSERT_GUARD,
    JOURNAL_PERIOD_UPDATE_GUARD,
  ];
  for (let index = 0; index < triggers.length; index += 1) {
    try {
      await db.exec(triggers[index]);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V7_STEP_${ddl.length + index + 1}: ${message} | SQL: CREATE treasury/period control trigger ${index + 1}`);
    }
  }

  await db
    .prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(TREASURY_PERIOD_VERSION)
    .run();
  completed += 1;

  return { alreadyApplied: false, statements: completed };
}
