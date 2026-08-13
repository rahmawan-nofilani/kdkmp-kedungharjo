import { getD1 } from "./context";

export const PROCUREMENT_ACCOUNTING_VERSION = "procurement_accounting_v4";

const PROCUREMENT_ACCOUNTING_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS supplier_invoices_one_active_po_uq
ON supplier_invoices (purchase_order_id)
WHERE status <> 'VOIDED';
`;

const PURCHASE_RECEIPT_ACCOUNTING_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS purchase_receipt_accounting_trigger
AFTER INSERT ON inventory_movements
WHEN NEW.movement_type = 'PURCHASE_RECEIPT'
 AND NEW.reference_type = 'GOODS_RECEIPT'
 AND NEW.quantity_delta > 0
 AND NEW.unit_cost_amount > 0
BEGIN
  INSERT INTO journal_entries (
    id, organization_id, entry_number, source_type, source_id, description,
    status, posted_by, posted_at, created_at
  ) VALUES (
    lower(hex(randomblob(16))),
    NEW.organization_id,
    'JRN-GR-' || NEW.id,
    'PURCHASE_RECEIPT_ITEM',
    NEW.id,
    'Penerimaan barang pembelian / GRNI',
    'POSTED',
    NEW.actor_user_id,
    NEW.occurred_at,
    NEW.created_at
  );

  INSERT INTO journal_lines (
    id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at
  )
  SELECT lower(hex(randomblob(16))), id, '1-1300', NEW.quantity_delta * NEW.unit_cost_amount, 0,
         'Persediaan dari goods receipt', NEW.created_at
  FROM journal_entries
  WHERE organization_id = NEW.organization_id
    AND source_type = 'PURCHASE_RECEIPT_ITEM'
    AND source_id = NEW.id;

  INSERT INTO journal_lines (
    id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at
  )
  SELECT lower(hex(randomblob(16))), id, '2-1500', 0, NEW.quantity_delta * NEW.unit_cost_amount,
         'GRNI - barang diterima belum ditagih', NEW.created_at
  FROM journal_entries
  WHERE organization_id = NEW.organization_id
    AND source_type = 'PURCHASE_RECEIPT_ITEM'
    AND source_id = NEW.id;
END;
`;

const SUPPLIER_PAYMENT_GUARD_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS supplier_payment_overpay_guard
BEFORE INSERT ON supplier_payments
WHEN NEW.status = 'POSTED'
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT SUM(amount)
      FROM supplier_payments
      WHERE supplier_invoice_id = NEW.supplier_invoice_id
        AND status = 'POSTED'
    ), 0) + NEW.amount > COALESCE((
      SELECT total_amount
      FROM supplier_invoices
      WHERE id = NEW.supplier_invoice_id
      LIMIT 1
    ), 0)
    THEN RAISE(ABORT, 'SUPPLIER_PAYMENT_OVERPAY')
  END;
END;
`;

function toStatements(sql: string) {
  return sql.split(";").map((statement) => statement.trim()).filter(Boolean);
}

export async function applyProcurementAccountingV4() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version = ? LIMIT 1")
    .bind(PROCUREMENT_ACCOUNTING_VERSION)
    .first<{ version: string }>();

  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  const statements = toStatements(PROCUREMENT_ACCOUNTING_SQL);
  let completed = 0;
  for (let index = 0; index < statements.length; index += 1) {
    try {
      await db.exec(`${statements[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V4_STEP_${index + 1}: ${message} | SQL: ${statements[index].replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }

  try {
    await db.exec(PURCHASE_RECEIPT_ACCOUNTING_TRIGGER);
    completed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`D1_UPGRADE_V4_STEP_${completed + 1}: ${message} | SQL: CREATE TRIGGER purchase_receipt_accounting_trigger`);
  }

  try {
    await db.exec(SUPPLIER_PAYMENT_GUARD_TRIGGER);
    completed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`D1_UPGRADE_V4_STEP_${completed + 1}: ${message} | SQL: CREATE TRIGGER supplier_payment_overpay_guard`);
  }

  await db
    .prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(PROCUREMENT_ACCOUNTING_VERSION)
    .run();
  completed += 1;

  return { alreadyApplied: false, statements: completed };
}
