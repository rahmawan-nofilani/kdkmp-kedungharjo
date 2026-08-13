import { getD1 } from "./context";

export const PROCUREMENT_VERSION = "procurement_v3";

const PROCUREMENT_SQL = `
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_id TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS suppliers_org_name_idx ON suppliers (organization_id, name);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  unit_id TEXT,
  pr_number TEXT NOT NULL,
  preferred_supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','PO_CREATED')),
  notes TEXT,
  total_estimated_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_estimated_amount >= 0),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  cancelled_at TEXT,
  UNIQUE (organization_id, pr_number)
);
CREATE INDEX IF NOT EXISTS purchase_requests_org_status_idx ON purchase_requests (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id TEXT PRIMARY KEY,
  purchase_request_id TEXT NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  estimated_unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (estimated_unit_cost_amount >= 0),
  line_total_amount INTEGER NOT NULL DEFAULT 0 CHECK (line_total_amount >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (purchase_request_id, product_id)
);
CREATE INDEX IF NOT EXISTS purchase_request_items_pr_idx ON purchase_request_items (purchase_request_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  purchase_request_id TEXT NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED','CLOSED')),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  expected_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  issued_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  issued_at TEXT,
  cancelled_at TEXT,
  UNIQUE (organization_id, po_number),
  UNIQUE (purchase_request_id)
);
CREATE INDEX IF NOT EXISTS purchase_orders_org_status_idx ON purchase_orders (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders (organization_id, supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  line_total_amount INTEGER NOT NULL DEFAULT 0 CHECK (line_total_amount >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (purchase_order_id, product_id)
);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items (purchase_order_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  receipt_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOIDED')),
  notes TEXT,
  received_by TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS goods_receipts_po_idx ON goods_receipts (purchase_order_id, received_at DESC);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id TEXT PRIMARY KEY,
  goods_receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE RESTRICT,
  purchase_order_item_id TEXT NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  batch_code TEXT,
  expiry_date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS goods_receipt_items_receipt_idx ON goods_receipt_items (goods_receipt_id);
CREATE INDEX IF NOT EXISTS goods_receipt_items_po_item_idx ON goods_receipt_items (purchase_order_item_id);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  subtotal_amount INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','MATCHED','MISMATCH','APPROVED','PAID','VOIDED')),
  match_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (match_status IN ('PENDING','MATCH','MISMATCH')),
  match_note TEXT,
  created_by TEXT NOT NULL,
  matched_by TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  matched_at TEXT,
  approved_at TEXT,
  paid_at TEXT,
  UNIQUE (organization_id, supplier_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS supplier_invoices_org_status_idx ON supplier_invoices (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS supplier_invoices_po_idx ON supplier_invoices (purchase_order_id);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id TEXT PRIMARY KEY,
  supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  purchase_order_item_id TEXT NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_billed INTEGER NOT NULL CHECK (quantity_billed > 0),
  unit_cost_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_amount >= 0),
  line_total_amount INTEGER NOT NULL DEFAULT 0 CHECK (line_total_amount >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supplier_invoice_items_invoice_idx ON supplier_invoice_items (supplier_invoice_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER')),
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOIDED')),
  reference_number TEXT,
  paid_by TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supplier_payments_invoice_idx ON supplier_payments (supplier_invoice_id, paid_at DESC);
`;

const OVER_RECEIPT_GUARD_SQL = `
CREATE TRIGGER IF NOT EXISTS goods_receipt_over_receive_guard
BEFORE INSERT ON goods_receipt_items
BEGIN
  SELECT CASE
    WHEN (
      COALESCE((
        SELECT SUM(gri.quantity_received)
        FROM goods_receipt_items gri
        JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
        WHERE gri.purchase_order_item_id = NEW.purchase_order_item_id
          AND gr.status = 'POSTED'
      ), 0) + NEW.quantity_received
    ) > COALESCE((
      SELECT quantity_ordered
      FROM purchase_order_items
      WHERE id = NEW.purchase_order_item_id
      LIMIT 1
    ), 0)
    THEN RAISE(ABORT, 'PROCUREMENT_OVER_RECEIPT')
  END;
END;
`;

function toStatements(sql: string) {
  return sql.split(";").map((statement) => statement.trim()).filter(Boolean);
}

export async function applyProcurementV3() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version = ? LIMIT 1")
    .bind(PROCUREMENT_VERSION)
    .first<{ version: string }>();

  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  const statements = toStatements(PROCUREMENT_SQL);
  let completed = 0;
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    try {
      await db.exec(`${statement};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const operation = statement.replace(/\s+/g, " ").slice(0, 110);
      throw new Error(`D1_UPGRADE_V3_STEP_${index + 1}: ${message} | SQL: ${operation}`);
    }
  }

  try {
    await db.exec(OVER_RECEIPT_GUARD_SQL);
    completed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`D1_UPGRADE_V3_STEP_${statements.length + 1}: ${message} | SQL: CREATE TRIGGER goods_receipt_over_receive_guard`);
  }

  await db
    .prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(PROCUREMENT_VERSION)
    .run();
  completed += 1;

  return { alreadyApplied: false, statements: completed };
}
