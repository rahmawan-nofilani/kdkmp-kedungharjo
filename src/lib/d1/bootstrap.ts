import { getD1 } from "./context";

const TRANSACTION_CORE_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  unit_name TEXT NOT NULL DEFAULT 'pcs',
  cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  sell_amount INTEGER NOT NULL DEFAULT 0 CHECK (sell_amount >= 0),
  track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0,1)),
  track_expiry INTEGER NOT NULL DEFAULT 0 CHECK (track_expiry IN (0,1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, sku)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_org_barcode_uq ON products (organization_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX IF NOT EXISTS products_org_name_idx ON products (organization_id, name);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  unit_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING','PURCHASE_RECEIPT','SALE','SALE_VOID','ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  batch_code TEXT,
  expiry_date TEXT,
  reference_type TEXT,
  reference_id TEXT,
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_movements_stock_idx ON inventory_movements (organization_id, warehouse_id, product_id, occurred_at);
CREATE INDEX IF NOT EXISTS inventory_movements_reference_idx ON inventory_movements (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS inventory_movements_expiry_idx ON inventory_movements (organization_id, expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS teller_shifts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  unit_id TEXT,
  teller_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','FORCE_CLOSED')),
  opening_cash_amount INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash_amount >= 0),
  expected_cash_amount INTEGER,
  counted_cash_amount INTEGER,
  variance_amount INTEGER,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS teller_shifts_user_status_idx ON teller_shifts (organization_id, teller_user_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  unit_id TEXT,
  shift_id TEXT NOT NULL REFERENCES teller_shifts(id) ON DELETE RESTRICT,
  receipt_number TEXT NOT NULL,
  member_id TEXT,
  teller_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMMITTED' CHECK (status IN ('COMMITTED','VOIDED')),
  subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'PAID' CHECK (payment_status IN ('PENDING','PAID','FAILED','REFUNDED')),
  idempotency_key TEXT NOT NULL,
  sold_at TEXT NOT NULL,
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, receipt_number),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS sales_org_sold_idx ON sales (organization_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS sales_member_idx ON sales (organization_id, member_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS sales_shift_idx ON sales (shift_id, sold_at DESC);

CREATE TABLE IF NOT EXISTS sale_lines (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_amount INTEGER NOT NULL CHECK (unit_price_amount >= 0),
  unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total_amount INTEGER NOT NULL CHECK (line_total_amount >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_lines_sale_idx ON sale_lines (sale_id);
CREATE INDEX IF NOT EXISTS sale_lines_product_idx ON sale_lines (product_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
  shift_id TEXT REFERENCES teller_shifts(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('CASH','QRIS','BANK_TRANSFER','MEMBER_BALANCE')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING','CONFIRMED','FAILED','REVERSED')),
  provider_reference TEXT,
  external_reference TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_sale_idx ON payments (sale_id);
CREATE INDEX IF NOT EXISTS payments_shift_idx ON payments (shift_id, method, status);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_uq ON payments (provider_reference) WHERE provider_reference IS NOT NULL AND provider_reference <> '';

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entry_number TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  posted_by TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, entry_number),
  UNIQUE (organization_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL,
  debit_amount INTEGER NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount INTEGER NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  memo TEXT,
  created_at TEXT NOT NULL,
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines (account_code);

CREATE TABLE IF NOT EXISTS request_idempotency (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT,
  resource_id TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PROCESSING','COMPLETED','FAILED')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS transaction_audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS transaction_audit_entity_idx ON transaction_audit_events (organization_id, entity_type, entity_id, created_at DESC);
`;

export async function initializeTransactionCore() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products' LIMIT 1")
    .first<{ name: string }>();

  if (existing?.name) {
    return { initialized: true, alreadyInitialized: true };
  }

  const result = await db.exec(TRANSACTION_CORE_SQL);
  return {
    initialized: true,
    alreadyInitialized: false,
    statements: result.count,
    duration: result.duration,
  };
}
