import { getD1 } from "./context";

export const ACCOUNTING_RUNTIME_VERSION = "accounting_runtime_v6";

const DROP_LEGACY_RECEIPT_TRIGGER = `DROP TRIGGER IF EXISTS purchase_receipt_accounting_trigger`;

const DYNAMIC_PURCHASE_RECEIPT_TRIGGER = `
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
  SELECT
    lower(hex(randomblob(16))),
    je.id,
    COALESCE((
      SELECT da.code
      FROM accounting_mappings am
      JOIN accounting_mapping_versions amv
        ON amv.mapping_id = am.id
       AND amv.version = am.current_approved_version
       AND amv.status = 'APPROVED'
      JOIN chart_of_accounts da
        ON da.id = amv.debit_account_id
       AND da.status = 'ACTIVE'
      WHERE am.organization_id = NEW.organization_id
        AND am.event_code = 'PURCHASE_RECEIPT'
        AND am.status = 'ACTIVE'
      LIMIT 1
    ), '1-1300'),
    NEW.quantity_delta * NEW.unit_cost_amount,
    0,
    'Persediaan dari goods receipt · runtime mapping',
    NEW.created_at
  FROM journal_entries je
  WHERE je.organization_id = NEW.organization_id
    AND je.source_type = 'PURCHASE_RECEIPT_ITEM'
    AND je.source_id = NEW.id;

  INSERT INTO journal_lines (
    id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at
  )
  SELECT
    lower(hex(randomblob(16))),
    je.id,
    COALESCE((
      SELECT ca.code
      FROM accounting_mappings am
      JOIN accounting_mapping_versions amv
        ON amv.mapping_id = am.id
       AND amv.version = am.current_approved_version
       AND amv.status = 'APPROVED'
      JOIN chart_of_accounts ca
        ON ca.id = amv.credit_account_id
       AND ca.status = 'ACTIVE'
      WHERE am.organization_id = NEW.organization_id
        AND am.event_code = 'PURCHASE_RECEIPT'
        AND am.status = 'ACTIVE'
      LIMIT 1
    ), '2-1500'),
    0,
    NEW.quantity_delta * NEW.unit_cost_amount,
    'GRNI · runtime mapping',
    NEW.created_at
  FROM journal_entries je
  WHERE je.organization_id = NEW.organization_id
    AND je.source_type = 'PURCHASE_RECEIPT_ITEM'
    AND je.source_id = NEW.id;
END;
`;

export async function applyAccountingRuntimeV6() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(ACCOUNTING_RUNTIME_VERSION)
    .first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  let completed = 0;
  try {
    await db.exec(`${DROP_LEGACY_RECEIPT_TRIGGER};`);
    completed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`D1_UPGRADE_V6_STEP_1: ${message} | SQL: DROP legacy purchase receipt accounting trigger`);
  }

  try {
    await db.exec(DYNAMIC_PURCHASE_RECEIPT_TRIGGER);
    completed += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`D1_UPGRADE_V6_STEP_2: ${message} | SQL: CREATE dynamic purchase receipt accounting trigger`);
  }

  await db
    .prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(ACCOUNTING_RUNTIME_VERSION)
    .run();
  completed += 1;

  return { alreadyApplied: false, statements: completed };
}
