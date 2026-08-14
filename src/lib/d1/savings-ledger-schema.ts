import { getD1 } from "./context";

export const SAVINGS_LEDGER_VERSION = "savings_ledger_v11";

const SAVINGS_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS savings_ledger_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_version_id TEXT NOT NULL,
  account_number TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  opened_at TEXT NOT NULL,
  min_opening_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_opening_amount >= 0),
  min_deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_deposit_amount >= 0),
  min_withdrawal_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_withdrawal_amount >= 0),
  min_balance_amount INTEGER NOT NULL DEFAULT 0 CHECK (min_balance_amount >= 0),
  max_balance_amount INTEGER CHECK (max_balance_amount IS NULL OR max_balance_amount >= 0),
  lock_until TEXT,
  maturity_date TEXT,
  early_withdrawal_allowed INTEGER NOT NULL DEFAULT 1 CHECK (early_withdrawal_allowed IN (0,1)),
  deposit_enabled INTEGER NOT NULL DEFAULT 1 CHECK (deposit_enabled IN (0,1)),
  withdrawal_enabled INTEGER NOT NULL DEFAULT 1 CHECK (withdrawal_enabled IN (0,1)),
  deposit_event_code TEXT NOT NULL DEFAULT 'SAVINGS_DEPOSIT',
  withdrawal_event_code TEXT NOT NULL DEFAULT 'SAVINGS_WITHDRAWAL',
  rule_snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, account_number)
);
CREATE INDEX IF NOT EXISTS savings_ledger_accounts_org_idx ON savings_ledger_accounts (organization_id, status, account_number);
CREATE INDEX IF NOT EXISTS savings_ledger_accounts_member_idx ON savings_ledger_accounts (organization_id, member_id, product_id);

CREATE TABLE IF NOT EXISTS savings_ledger_transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  savings_account_id TEXT NOT NULL REFERENCES savings_ledger_accounts(id) ON DELETE RESTRICT,
  transaction_number TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEPOSIT','WITHDRAWAL','REVERSAL')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  balance_delta_amount INTEGER NOT NULL CHECK (balance_delta_amount <> 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','BANK_TRANSFER')),
  treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
  shift_id TEXT REFERENCES teller_shifts(id) ON DELETE RESTRICT,
  reference_number TEXT,
  note TEXT,
  source_event_code TEXT NOT NULL,
  accounting_mapping_version INTEGER NOT NULL DEFAULT 0 CHECK (accounting_mapping_version >= 0),
  asset_account_code TEXT NOT NULL,
  liability_account_code TEXT NOT NULL,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  original_transaction_id TEXT REFERENCES savings_ledger_transactions(id) ON DELETE RESTRICT,
  reversal_reason TEXT,
  actor_user_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, transaction_number),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS savings_ledger_transactions_account_idx ON savings_ledger_transactions (organization_id, savings_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS savings_ledger_transactions_shift_idx ON savings_ledger_transactions (organization_id, shift_id, payment_method, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS savings_ledger_single_reversal_uq ON savings_ledger_transactions (original_transaction_id) WHERE original_transaction_id IS NOT NULL;
`;

const TRANSACTION_IMMUTABLE = `
CREATE TRIGGER IF NOT EXISTS savings_ledger_transaction_update_guard
BEFORE UPDATE ON savings_ledger_transactions
BEGIN
  SELECT RAISE(ABORT, 'SAVINGS_TRANSACTION_IMMUTABLE');
END;
`;

const TRANSACTION_DELETE_GUARD = `
CREATE TRIGGER IF NOT EXISTS savings_ledger_transaction_delete_guard
BEFORE DELETE ON savings_ledger_transactions
BEGIN
  SELECT RAISE(ABORT, 'SAVINGS_TRANSACTION_DELETE_FORBIDDEN');
END;
`;

const TRANSACTION_RULE_GUARD = `
CREATE TRIGGER IF NOT EXISTS savings_ledger_transaction_rule_guard
BEFORE INSERT ON savings_ledger_transactions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM savings_ledger_accounts a
    WHERE a.id=NEW.savings_account_id AND a.organization_id=NEW.organization_id AND a.status='ACTIVE'
  ) THEN RAISE(ABORT, 'SAVINGS_ACCOUNT_NOT_ACTIVE') END;

  SELECT CASE WHEN NEW.transaction_type='DEPOSIT' AND NEW.balance_delta_amount <> NEW.amount
    THEN RAISE(ABORT, 'SAVINGS_DEPOSIT_DIRECTION_INVALID') END;
  SELECT CASE WHEN NEW.transaction_type='WITHDRAWAL' AND NEW.balance_delta_amount <> -NEW.amount
    THEN RAISE(ABORT, 'SAVINGS_WITHDRAWAL_DIRECTION_INVALID') END;
  SELECT CASE WHEN NEW.transaction_type IN ('DEPOSIT','WITHDRAWAL') AND NEW.original_transaction_id IS NOT NULL
    THEN RAISE(ABORT, 'SAVINGS_ORIGINAL_REFERENCE_INVALID') END;

  SELECT CASE WHEN NEW.transaction_type='REVERSAL' AND NOT EXISTS (
    SELECT 1 FROM savings_ledger_transactions o
    WHERE o.id=NEW.original_transaction_id
      AND o.organization_id=NEW.organization_id
      AND o.savings_account_id=NEW.savings_account_id
      AND o.transaction_type IN ('DEPOSIT','WITHDRAWAL')
      AND NEW.balance_delta_amount = -o.balance_delta_amount
      AND NEW.amount = o.amount
      AND NEW.payment_method = o.payment_method
      AND NEW.treasury_account_id = o.treasury_account_id
  ) THEN RAISE(ABORT, 'SAVINGS_REVERSAL_INVALID') END;

  SELECT CASE WHEN NEW.payment_method='CASH' AND NOT EXISTS (
    SELECT 1 FROM teller_shifts s
    WHERE s.id=NEW.shift_id AND s.organization_id=NEW.organization_id
      AND s.teller_user_id=NEW.actor_user_id AND s.status='OPEN'
  ) THEN RAISE(ABORT, 'SAVINGS_OPEN_SHIFT_REQUIRED') END;
  SELECT CASE WHEN NEW.payment_method='BANK_TRANSFER' AND NEW.shift_id IS NOT NULL
    THEN RAISE(ABORT, 'SAVINGS_BANK_SHIFT_MUST_BE_NULL') END;

  SELECT CASE WHEN NEW.transaction_type='DEPOSIT' AND COALESCE((
    SELECT deposit_enabled FROM savings_ledger_accounts WHERE id=NEW.savings_account_id
  ),0) <> 1 THEN RAISE(ABORT, 'SAVINGS_DEPOSIT_DISABLED') END;

  SELECT CASE WHEN NEW.transaction_type='DEPOSIT' AND NEW.amount < COALESCE((
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM savings_ledger_transactions d
        WHERE d.savings_account_id=NEW.savings_account_id AND d.transaction_type='DEPOSIT'
          AND NOT EXISTS (SELECT 1 FROM savings_ledger_transactions r WHERE r.original_transaction_id=d.id)
      ) THEN MAX(min_opening_amount,min_deposit_amount)
      ELSE min_deposit_amount END
    FROM savings_ledger_accounts WHERE id=NEW.savings_account_id
  ),0) THEN RAISE(ABORT, 'SAVINGS_DEPOSIT_BELOW_MINIMUM') END;

  SELECT CASE WHEN NEW.transaction_type='DEPOSIT' AND EXISTS (
    SELECT 1 FROM savings_ledger_accounts a
    WHERE a.id=NEW.savings_account_id AND a.max_balance_amount IS NOT NULL
      AND COALESCE((SELECT SUM(t.balance_delta_amount) FROM savings_ledger_transactions t WHERE t.savings_account_id=NEW.savings_account_id),0) + NEW.balance_delta_amount > a.max_balance_amount
  ) THEN RAISE(ABORT, 'SAVINGS_MAX_BALANCE_EXCEEDED') END;

  SELECT CASE WHEN NEW.transaction_type='WITHDRAWAL' AND COALESCE((
    SELECT withdrawal_enabled FROM savings_ledger_accounts WHERE id=NEW.savings_account_id
  ),0) <> 1 THEN RAISE(ABORT, 'SAVINGS_WITHDRAWAL_DISABLED') END;

  SELECT CASE WHEN NEW.transaction_type='WITHDRAWAL' AND NEW.amount < COALESCE((
    SELECT min_withdrawal_amount FROM savings_ledger_accounts WHERE id=NEW.savings_account_id
  ),0) THEN RAISE(ABORT, 'SAVINGS_WITHDRAWAL_BELOW_MINIMUM') END;

  SELECT CASE WHEN NEW.transaction_type='WITHDRAWAL' AND EXISTS (
    SELECT 1 FROM savings_ledger_accounts a
    WHERE a.id=NEW.savings_account_id AND a.lock_until IS NOT NULL
      AND date(NEW.occurred_at,'+7 hours') < date(a.lock_until)
  ) THEN RAISE(ABORT, 'SAVINGS_ACCOUNT_LOCKED') END;

  SELECT CASE WHEN NEW.transaction_type='WITHDRAWAL' AND EXISTS (
    SELECT 1 FROM savings_ledger_accounts a
    WHERE a.id=NEW.savings_account_id AND a.early_withdrawal_allowed=0 AND a.maturity_date IS NOT NULL
      AND date(NEW.occurred_at,'+7 hours') < date(a.maturity_date)
  ) THEN RAISE(ABORT, 'SAVINGS_NOT_MATURED') END;

  SELECT CASE WHEN NEW.balance_delta_amount < 0 AND
    COALESCE((SELECT SUM(t.balance_delta_amount) FROM savings_ledger_transactions t WHERE t.savings_account_id=NEW.savings_account_id),0) + NEW.balance_delta_amount < 0
    THEN RAISE(ABORT, 'SAVINGS_NEGATIVE_BALANCE_FORBIDDEN') END;

  SELECT CASE WHEN NEW.transaction_type='WITHDRAWAL' AND EXISTS (
    SELECT 1 FROM savings_ledger_accounts a
    WHERE a.id=NEW.savings_account_id
      AND COALESCE((SELECT SUM(t.balance_delta_amount) FROM savings_ledger_transactions t WHERE t.savings_account_id=NEW.savings_account_id),0) + NEW.balance_delta_amount < a.min_balance_amount
  ) THEN RAISE(ABORT, 'SAVINGS_MIN_BALANCE_VIOLATION') END;
END;
`;

function statements(sql: string) {
  return sql.split(";").map((item) => item.trim()).filter(Boolean);
}

export async function applySavingsLedgerV11() {
  const db = getD1();
  const existing = await db.prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(SAVINGS_LEDGER_VERSION).first<{version:string}>();
  if (existing?.version) return { alreadyApplied:true, statements:0 };

  let completed=0;
  const ddl=statements(SAVINGS_LEDGER_SQL);
  for (let index=0; index<ddl.length; index+=1) {
    try { await db.exec(`${ddl[index]};`); completed+=1; }
    catch (error) {
      const message=error instanceof Error?error.message:String(error);
      throw new Error(`D1_UPGRADE_V11_STEP_${index+1}: ${message} | SQL: ${ddl[index].replace(/\s+/g," ").slice(0,120)}`);
    }
  }

  const triggers=[TRANSACTION_IMMUTABLE,TRANSACTION_DELETE_GUARD,TRANSACTION_RULE_GUARD];
  for (let index=0; index<triggers.length; index+=1) {
    try { await db.exec(triggers[index]); completed+=1; }
    catch (error) {
      const message=error instanceof Error?error.message:String(error);
      throw new Error(`D1_UPGRADE_V11_STEP_${ddl.length+index+1}: ${message} | SQL: CREATE savings control trigger ${index+1}`);
    }
  }

  await db.prepare("INSERT OR IGNORE INTO app_schema_versions (version,applied_at) VALUES (?,datetime('now'))")
    .bind(SAVINGS_LEDGER_VERSION).run();
  completed+=1;
  return { alreadyApplied:false, statements:completed };
}
