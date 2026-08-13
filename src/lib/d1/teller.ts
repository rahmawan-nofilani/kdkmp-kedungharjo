import { getShiftReconciliation } from "./closing";
import { getD1 } from "./context";

export type TellerShiftRow = {
  id: string;
  status: string;
  opening_cash_amount: number;
  expected_cash_amount: number | null;
  counted_cash_amount: number | null;
  variance_amount: number | null;
  opened_at: string;
  closed_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

export async function getOpenShift(organizationId: string, tellerUserId: string) {
  const db = getD1();
  const row = await db
    .prepare(
      "SELECT id, status, opening_cash_amount, expected_cash_amount, counted_cash_amount, variance_amount, opened_at, closed_at FROM teller_shifts WHERE organization_id = ? AND teller_user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1",
    )
    .bind(organizationId, tellerUserId)
    .first<TellerShiftRow>();

  return row
    ? {
        ...row,
        opening_cash_amount: Number(row.opening_cash_amount),
        expected_cash_amount: row.expected_cash_amount == null ? null : Number(row.expected_cash_amount),
        counted_cash_amount: row.counted_cash_amount == null ? null : Number(row.counted_cash_amount),
        variance_amount: row.variance_amount == null ? null : Number(row.variance_amount),
      }
    : null;
}

export async function getTellerReadiness(organizationId: string) {
  const db = getD1();
  const [productRow, warehouseRow, movementRow] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS count FROM products WHERE organization_id = ? AND status = 'ACTIVE'")
      .bind(organizationId)
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM warehouses WHERE organization_id = ? AND status = 'ACTIVE'")
      .bind(organizationId)
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE organization_id = ?")
      .bind(organizationId)
      .first<{ count: number }>(),
  ]);

  const products = Number(productRow?.count ?? 0);
  const warehouses = Number(warehouseRow?.count ?? 0);
  const movements = Number(movementRow?.count ?? 0);

  return {
    products,
    warehouses,
    movements,
    inventoryReady: products > 0 && warehouses > 0 && movements > 0,
  };
}

export async function openTellerShift(input: {
  organizationId: string;
  unitId?: string | null;
  tellerUserId: string;
  openingCashAmount: number;
}) {
  const db = getD1();
  const existing = await getOpenShift(input.organizationId, input.tellerUserId);
  if (existing) throw new Error("Masih ada shift teller yang OPEN.");

  const readiness = await getTellerReadiness(input.organizationId);
  if (!readiness.inventoryReady) {
    throw new Error("Product master, gudang, dan opening stock harus siap sebelum shift dibuka.");
  }

  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = nowIso();

  const shift = db
    .prepare(
      "INSERT INTO teller_shifts (id, organization_id, unit_id, teller_user_id, status, opening_cash_amount, expected_cash_amount, counted_cash_amount, variance_amount, opened_at, closed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'OPEN', ?, NULL, NULL, NULL, ?, NULL, ?, ?)",
    )
    .bind(
      id,
      input.organizationId,
      input.unitId ?? null,
      input.tellerUserId,
      input.openingCashAmount,
      now,
      now,
      now,
    );

  const audit = db
    .prepare(
      "INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'TELLER_SHIFT_OPENED', 'TELLER_SHIFT', ?, ?, ?)",
    )
    .bind(
      auditId,
      input.organizationId,
      input.tellerUserId,
      id,
      JSON.stringify({ openingCashAmount: input.openingCashAmount }),
      now,
    );

  await db.batch([shift, audit]);
  return id;
}

export async function closeTellerShift(input: {
  organizationId: string;
  tellerUserId: string;
  countedCashAmount: number;
}) {
  const db = getD1();
  const shift = await getOpenShift(input.organizationId, input.tellerUserId);
  if (!shift) throw new Error("Tidak ada shift OPEN untuk ditutup.");

  const reconciliation = await getShiftReconciliation(input.organizationId, shift.id);
  if (!reconciliation) throw new Error("Data rekonsiliasi shift tidak ditemukan.");
  if (!reconciliation.passed) {
    throw new Error(
      `Shift belum dapat ditutup. Ada ${reconciliation.metrics.issueCount} exception transaksi yang harus diperiksa.`,
    );
  }

  const cashSales = reconciliation.metrics.cashConfirmedAmount;
  const expected = reconciliation.metrics.expectedCashAmount;
  const variance = input.countedCashAmount - expected;
  const now = nowIso();
  const auditId = crypto.randomUUID();

  const update = db
    .prepare(
      "UPDATE teller_shifts SET status = 'CLOSED', expected_cash_amount = ?, counted_cash_amount = ?, variance_amount = ?, closed_at = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND teller_user_id = ? AND status = 'OPEN'",
    )
    .bind(
      expected,
      input.countedCashAmount,
      variance,
      now,
      now,
      shift.id,
      input.organizationId,
      input.tellerUserId,
    );

  const audit = db
    .prepare(
      "INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'TELLER_SHIFT_CLOSED', 'TELLER_SHIFT', ?, ?, ?)",
    )
    .bind(
      auditId,
      input.organizationId,
      input.tellerUserId,
      shift.id,
      JSON.stringify({
        openingCashAmount: shift.opening_cash_amount,
        cashSales,
        expectedCashAmount: expected,
        countedCashAmount: input.countedCashAmount,
        varianceAmount: variance,
        committedTransactions: reconciliation.metrics.committedTransactions,
        voidedTransactions: reconciliation.metrics.voidedTransactions,
        reconciliationPassed: true,
      }),
      now,
    );

  await db.batch([update, audit]);

  return {
    expectedCashAmount: expected,
    countedCashAmount: input.countedCashAmount,
    varianceAmount: variance,
  };
}
