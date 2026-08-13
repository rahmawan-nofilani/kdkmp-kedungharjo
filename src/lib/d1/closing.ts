import { getD1 } from "./context";

export type ShiftRow = {
  id: string;
  organization_id: string;
  teller_user_id: string;
  status: string;
  opening_cash_amount: number;
  expected_cash_amount: number | null;
  counted_cash_amount: number | null;
  variance_amount: number | null;
  opened_at: string;
  closed_at: string | null;
};

type ShiftSaleRow = {
  id: string;
  receipt_number: string;
  status: string;
  total_amount: number;
  sold_at: string;
};

type PaymentAggregateRow = {
  sale_id: string;
  confirmed_amount: number;
  reversed_amount: number;
  cash_confirmed_amount: number;
};

type LineAggregateRow = {
  sale_id: string;
  line_total_amount: number;
  tracked_quantity: number;
};

type MovementAggregateRow = {
  sale_id: string;
  sale_out_quantity: number;
  void_in_quantity: number;
};

type JournalAggregateRow = {
  sale_id: string;
  sale_debit: number;
  sale_credit: number;
  void_debit: number;
  void_credit: number;
};

export type ShiftReconciliationIssue = {
  saleId: string;
  receiptNumber: string;
  code: "LINE_TOTAL" | "PAYMENT" | "JOURNAL" | "INVENTORY" | "VOID_REVERSAL";
  message: string;
};

function numeric<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]) {
  const copy = { ...row };
  for (const key of keys) {
    copy[key] = Number(row[key] ?? 0) as T[keyof T];
  }
  return copy;
}

export async function getShiftReconciliation(organizationId: string, shiftId: string) {
  const db = getD1();
  const shiftRaw = await db
    .prepare(
      "SELECT id, organization_id, teller_user_id, status, opening_cash_amount, expected_cash_amount, counted_cash_amount, variance_amount, opened_at, closed_at FROM teller_shifts WHERE id = ? AND organization_id = ? LIMIT 1",
    )
    .bind(shiftId, organizationId)
    .first<ShiftRow>();

  if (!shiftRaw) return null;

  const shift = {
    ...shiftRaw,
    opening_cash_amount: Number(shiftRaw.opening_cash_amount),
    expected_cash_amount: shiftRaw.expected_cash_amount == null ? null : Number(shiftRaw.expected_cash_amount),
    counted_cash_amount: shiftRaw.counted_cash_amount == null ? null : Number(shiftRaw.counted_cash_amount),
    variance_amount: shiftRaw.variance_amount == null ? null : Number(shiftRaw.variance_amount),
  };

  const [salesResult, paymentsResult, linesResult, movementsResult, journalsResult] = await Promise.all([
    db
      .prepare(
        "SELECT id, receipt_number, status, total_amount, sold_at FROM sales WHERE organization_id = ? AND shift_id = ? ORDER BY sold_at ASC",
      )
      .bind(organizationId, shiftId)
      .all<ShiftSaleRow>(),
    db
      .prepare(
        "SELECT p.sale_id, COALESCE(SUM(CASE WHEN p.status = 'CONFIRMED' THEN p.amount ELSE 0 END),0) AS confirmed_amount, COALESCE(SUM(CASE WHEN p.status = 'REVERSED' THEN p.amount ELSE 0 END),0) AS reversed_amount, COALESCE(SUM(CASE WHEN p.method = 'CASH' AND p.status = 'CONFIRMED' THEN p.amount ELSE 0 END),0) AS cash_confirmed_amount FROM payments p WHERE p.organization_id = ? AND p.shift_id = ? AND p.sale_id IS NOT NULL GROUP BY p.sale_id",
      )
      .bind(organizationId, shiftId)
      .all<PaymentAggregateRow>(),
    db
      .prepare(
        "SELECT sl.sale_id, COALESCE(SUM(sl.line_total_amount),0) AS line_total_amount, COALESCE(SUM(CASE WHEN p.track_stock = 1 THEN sl.quantity ELSE 0 END),0) AS tracked_quantity FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id JOIN products p ON p.id = sl.product_id WHERE s.organization_id = ? AND s.shift_id = ? GROUP BY sl.sale_id",
      )
      .bind(organizationId, shiftId)
      .all<LineAggregateRow>(),
    db
      .prepare(
        "SELECT im.reference_id AS sale_id, COALESCE(SUM(CASE WHEN im.movement_type = 'SALE' THEN ABS(im.quantity_delta) ELSE 0 END),0) AS sale_out_quantity, COALESCE(SUM(CASE WHEN im.movement_type = 'SALE_VOID' THEN im.quantity_delta ELSE 0 END),0) AS void_in_quantity FROM inventory_movements im WHERE im.organization_id = ? AND im.reference_id IN (SELECT id FROM sales WHERE organization_id = ? AND shift_id = ?) AND im.reference_type IN ('SALE','SALE_VOID') GROUP BY im.reference_id",
      )
      .bind(organizationId, organizationId, shiftId)
      .all<MovementAggregateRow>(),
    db
      .prepare(
        "SELECT je.source_id AS sale_id, COALESCE(SUM(CASE WHEN je.source_type = 'SALE' THEN jl.debit_amount ELSE 0 END),0) AS sale_debit, COALESCE(SUM(CASE WHEN je.source_type = 'SALE' THEN jl.credit_amount ELSE 0 END),0) AS sale_credit, COALESCE(SUM(CASE WHEN je.source_type = 'SALE_VOID' THEN jl.debit_amount ELSE 0 END),0) AS void_debit, COALESCE(SUM(CASE WHEN je.source_type = 'SALE_VOID' THEN jl.credit_amount ELSE 0 END),0) AS void_credit FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id WHERE je.organization_id = ? AND je.source_id IN (SELECT id FROM sales WHERE organization_id = ? AND shift_id = ?) AND je.source_type IN ('SALE','SALE_VOID') GROUP BY je.source_id",
      )
      .bind(organizationId, organizationId, shiftId)
      .all<JournalAggregateRow>(),
  ]);

  const sales = salesResult.results.map((row) => ({ ...row, total_amount: Number(row.total_amount) }));
  const payments = new Map(
    paymentsResult.results.map((row) => [
      row.sale_id,
      numeric(row, ["confirmed_amount", "reversed_amount", "cash_confirmed_amount"]),
    ]),
  );
  const lines = new Map(
    linesResult.results.map((row) => [row.sale_id, numeric(row, ["line_total_amount", "tracked_quantity"])]),
  );
  const movements = new Map(
    movementsResult.results.map((row) => [row.sale_id, numeric(row, ["sale_out_quantity", "void_in_quantity"])]),
  );
  const journals = new Map(
    journalsResult.results.map((row) => [row.sale_id, numeric(row, ["sale_debit", "sale_credit", "void_debit", "void_credit"])]),
  );

  const issues: ShiftReconciliationIssue[] = [];

  for (const sale of sales) {
    const payment = payments.get(sale.id);
    const line = lines.get(sale.id);
    const movement = movements.get(sale.id);
    const journal = journals.get(sale.id);

    const lineTotal = Number(line?.line_total_amount ?? 0);
    if (lineTotal !== sale.total_amount) {
      issues.push({
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        code: "LINE_TOTAL",
        message: `Total detail ${lineTotal} tidak sama dengan total struk ${sale.total_amount}.`,
      });
    }

    if (sale.status === "COMMITTED") {
      const paid = Number(payment?.confirmed_amount ?? 0);
      if (paid !== sale.total_amount) {
        issues.push({
          saleId: sale.id,
          receiptNumber: sale.receipt_number,
          code: "PAYMENT",
          message: `Pembayaran terkonfirmasi ${paid} tidak sama dengan total ${sale.total_amount}.`,
        });
      }
    } else if (sale.status === "VOIDED") {
      const reversed = Number(payment?.reversed_amount ?? 0);
      if (reversed !== sale.total_amount) {
        issues.push({
          saleId: sale.id,
          receiptNumber: sale.receipt_number,
          code: "PAYMENT",
          message: `Pembayaran reversal ${reversed} tidak sama dengan total void ${sale.total_amount}.`,
        });
      }
    }

    const saleDebit = Number(journal?.sale_debit ?? 0);
    const saleCredit = Number(journal?.sale_credit ?? 0);
    if (saleDebit <= 0 || saleDebit !== saleCredit) {
      issues.push({
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        code: "JOURNAL",
        message: `Jurnal penjualan tidak balance (${saleDebit} / ${saleCredit}).`,
      });
    }

    if (sale.status === "VOIDED") {
      const voidDebit = Number(journal?.void_debit ?? 0);
      const voidCredit = Number(journal?.void_credit ?? 0);
      if (voidDebit <= 0 || voidDebit !== voidCredit) {
        issues.push({
          saleId: sale.id,
          receiptNumber: sale.receipt_number,
          code: "VOID_REVERSAL",
          message: `Jurnal reversal void tidak balance (${voidDebit} / ${voidCredit}).`,
        });
      }
    }

    const trackedQty = Number(line?.tracked_quantity ?? 0);
    const saleOut = Number(movement?.sale_out_quantity ?? 0);
    const voidIn = Number(movement?.void_in_quantity ?? 0);
    const inventoryOk = sale.status === "VOIDED"
      ? trackedQty === saleOut && saleOut === voidIn
      : trackedQty === saleOut;

    if (!inventoryOk) {
      issues.push({
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        code: "INVENTORY",
        message: sale.status === "VOIDED"
          ? `Stok sale/void tidak konsisten (${trackedQty}/${saleOut}/${voidIn}).`
          : `Stok keluar tidak konsisten (${trackedQty}/${saleOut}).`,
      });
    }
  }

  const committed = sales.filter((sale) => sale.status === "COMMITTED");
  const voided = sales.filter((sale) => sale.status === "VOIDED");
  const committedSalesAmount = committed.reduce((sum, sale) => sum + sale.total_amount, 0);
  const cashConfirmedAmount = committed.reduce(
    (sum, sale) => sum + Number(payments.get(sale.id)?.cash_confirmed_amount ?? 0),
    0,
  );
  const expectedCashAmount = shift.opening_cash_amount + cashConfirmedAmount;

  return {
    shift,
    sales,
    metrics: {
      committedTransactions: committed.length,
      voidedTransactions: voided.length,
      committedSalesAmount,
      cashConfirmedAmount,
      expectedCashAmount,
      issueCount: issues.length,
    },
    issues,
    passed: issues.length === 0,
  };
}

export async function getRecentShiftHistory(organizationId: string, limit = 12) {
  const db = getD1();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const result = await db
    .prepare(
      `SELECT ts.id, ts.organization_id, ts.teller_user_id, ts.status, ts.opening_cash_amount, ts.expected_cash_amount, ts.counted_cash_amount, ts.variance_amount, ts.opened_at, ts.closed_at, COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.shift_id = ts.id AND s.status = 'COMMITTED'),0) AS committed_sales_amount, COALESCE((SELECT COUNT(*) FROM sales s WHERE s.shift_id = ts.id AND s.status = 'COMMITTED'),0) AS transaction_count FROM teller_shifts ts WHERE ts.organization_id = ? ORDER BY ts.opened_at DESC LIMIT ${safeLimit}`,
    )
    .bind(organizationId)
    .all<ShiftRow & { committed_sales_amount: number; transaction_count: number }>();

  return result.results.map((row) => ({
    ...row,
    opening_cash_amount: Number(row.opening_cash_amount),
    expected_cash_amount: row.expected_cash_amount == null ? null : Number(row.expected_cash_amount),
    counted_cash_amount: row.counted_cash_amount == null ? null : Number(row.counted_cash_amount),
    variance_amount: row.variance_amount == null ? null : Number(row.variance_amount),
    committed_sales_amount: Number(row.committed_sales_amount),
    transaction_count: Number(row.transaction_count),
  }));
}
