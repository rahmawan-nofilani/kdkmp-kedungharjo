import { getD1 } from "./context";

type SaleRow = {
  id: string;
  receipt_number: string;
  member_id: string | null;
  teller_user_id: string;
  shift_id: string;
  status: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_status: string;
  sold_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

type SaleLineRow = {
  id: string;
  product_id: string;
  sku_snapshot: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price_amount: number;
  unit_cost_amount: number;
  discount_amount: number;
  line_total_amount: number;
  track_stock: number;
};

type PaymentRow = {
  id: string;
  method: string;
  amount: number;
  status: string;
  confirmed_at: string | null;
};

type JournalLineRow = {
  journal_entry_id: string;
  entry_number: string;
  source_type: string;
  status: string;
  account_code: string;
  debit_amount: number;
  credit_amount: number;
  memo: string | null;
};

type MovementSummaryRow = {
  movement_type: string;
  quantity: number;
};

function nowIso() {
  return new Date().toISOString();
}

function wibDayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Tanggal laporan tidak valid.");
  const startMs = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(startMs)) throw new Error("Tanggal laporan tidak valid.");
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000).toISOString(),
  };
}

export async function getSaleReceipt(organizationId: string, saleId: string) {
  const db = getD1();
  const sale = await db
    .prepare(
      "SELECT id, receipt_number, member_id, teller_user_id, shift_id, status, subtotal_amount, discount_amount, total_amount, payment_status, sold_at, voided_at, voided_by, void_reason FROM sales WHERE id = ? AND organization_id = ? LIMIT 1",
    )
    .bind(saleId, organizationId)
    .first<SaleRow>();

  if (!sale) return null;

  const [lineResult, paymentResult, journalResult, movementResult] = await Promise.all([
    db
      .prepare(
        "SELECT sl.id, sl.product_id, sl.sku_snapshot, sl.product_name_snapshot, sl.quantity, sl.unit_price_amount, sl.unit_cost_amount, sl.discount_amount, sl.line_total_amount, p.track_stock FROM sale_lines sl JOIN products p ON p.id = sl.product_id WHERE sl.sale_id = ? ORDER BY sl.created_at, sl.id",
      )
      .bind(saleId)
      .all<SaleLineRow>(),
    db
      .prepare(
        "SELECT id, method, amount, status, confirmed_at FROM payments WHERE organization_id = ? AND sale_id = ? ORDER BY created_at",
      )
      .bind(organizationId, saleId)
      .all<PaymentRow>(),
    db
      .prepare(
        "SELECT je.id AS journal_entry_id, je.entry_number, je.source_type, je.status, jl.account_code, jl.debit_amount, jl.credit_amount, jl.memo FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id WHERE je.organization_id = ? AND je.source_id = ? ORDER BY je.created_at, jl.created_at",
      )
      .bind(organizationId, saleId)
      .all<JournalLineRow>(),
    db
      .prepare(
        "SELECT movement_type, COALESCE(SUM(quantity_delta),0) AS quantity FROM inventory_movements WHERE organization_id = ? AND reference_id = ? AND reference_type IN ('SALE','SALE_VOID') GROUP BY movement_type",
      )
      .bind(organizationId, saleId)
      .all<MovementSummaryRow>(),
  ]);

  const lines = lineResult.results.map((line) => ({
    ...line,
    quantity: Number(line.quantity),
    unit_price_amount: Number(line.unit_price_amount),
    unit_cost_amount: Number(line.unit_cost_amount),
    discount_amount: Number(line.discount_amount),
    line_total_amount: Number(line.line_total_amount),
    track_stock: Number(line.track_stock),
  }));
  const payments = paymentResult.results.map((payment) => ({
    ...payment,
    amount: Number(payment.amount),
  }));
  const journals = journalResult.results.map((line) => ({
    ...line,
    debit_amount: Number(line.debit_amount),
    credit_amount: Number(line.credit_amount),
  }));
  const movements = movementResult.results.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
  }));

  const normalizedSale = {
    ...sale,
    subtotal_amount: Number(sale.subtotal_amount),
    discount_amount: Number(sale.discount_amount),
    total_amount: Number(sale.total_amount),
  };

  const lineTotal = lines.reduce((sum, line) => sum + line.line_total_amount, 0);
  const confirmedPayments = payments
    .filter((payment) => payment.status === "CONFIRMED")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const reversedPayments = payments
    .filter((payment) => payment.status === "REVERSED")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const journalDebit = journals.reduce((sum, line) => sum + line.debit_amount, 0);
  const journalCredit = journals.reduce((sum, line) => sum + line.credit_amount, 0);
  const trackedQty = lines
    .filter((line) => line.track_stock === 1)
    .reduce((sum, line) => sum + line.quantity, 0);
  const saleOut = Math.abs(
    movements.find((movement) => movement.movement_type === "SALE")?.quantity ?? 0,
  );
  const voidIn = movements.find((movement) => movement.movement_type === "SALE_VOID")?.quantity ?? 0;

  const amountMatch = lineTotal === normalizedSale.total_amount;
  const paymentMatch = normalizedSale.status === "VOIDED"
    ? reversedPayments === normalizedSale.total_amount
    : confirmedPayments === normalizedSale.total_amount;
  const journalBalanced = journalDebit > 0 && journalDebit === journalCredit;
  const inventoryMatch = normalizedSale.status === "VOIDED"
    ? trackedQty === saleOut && saleOut === voidIn
    : trackedQty === saleOut;

  return {
    sale: normalizedSale,
    lines,
    payments,
    journals,
    movements,
    reconciliation: {
      lineTotal,
      confirmedPayments,
      reversedPayments,
      journalDebit,
      journalCredit,
      trackedQty,
      saleOut,
      voidIn,
      amountMatch,
      paymentMatch,
      journalBalanced,
      inventoryMatch,
      passed: amountMatch && paymentMatch && journalBalanced && inventoryMatch,
    },
  };
}

export async function getDailySalesReport(organizationId: string, date: string) {
  const db = getD1();
  const { start, end } = wibDayBounds(date);

  const [salesResult, cogsRow, paymentResult] = await Promise.all([
    db
      .prepare(
        "SELECT id, receipt_number, member_id, teller_user_id, shift_id, status, subtotal_amount, discount_amount, total_amount, payment_status, sold_at, voided_at, voided_by, void_reason FROM sales WHERE organization_id = ? AND sold_at >= ? AND sold_at < ? ORDER BY sold_at DESC",
      )
      .bind(organizationId, start, end)
      .all<SaleRow>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(sl.quantity * sl.unit_cost_amount),0) AS cogs FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id WHERE s.organization_id = ? AND s.sold_at >= ? AND s.sold_at < ? AND s.status = 'COMMITTED'",
      )
      .bind(organizationId, start, end)
      .first<{ cogs: number }>(),
    db
      .prepare(
        "SELECT p.method, COALESCE(SUM(p.amount),0) AS amount FROM payments p JOIN sales s ON s.id = p.sale_id WHERE p.organization_id = ? AND s.sold_at >= ? AND s.sold_at < ? AND s.status = 'COMMITTED' AND p.status = 'CONFIRMED' GROUP BY p.method ORDER BY p.method",
      )
      .bind(organizationId, start, end)
      .all<{ method: string; amount: number }>(),
  ]);

  const sales = salesResult.results.map((sale) => ({
    ...sale,
    subtotal_amount: Number(sale.subtotal_amount),
    discount_amount: Number(sale.discount_amount),
    total_amount: Number(sale.total_amount),
  }));
  const committed = sales.filter((sale) => sale.status === "COMMITTED");
  const voided = sales.filter((sale) => sale.status === "VOIDED");
  const revenue = committed.reduce((sum, sale) => sum + sale.total_amount, 0);
  const cogs = Number(cogsRow?.cogs ?? 0);

  return {
    date,
    bounds: { start, end },
    sales,
    metrics: {
      transactions: committed.length,
      voided: voided.length,
      revenue,
      cogs,
      grossMargin: revenue - cogs,
      averageTicket: committed.length ? Math.round(revenue / committed.length) : 0,
    },
    payments: paymentResult.results.map((row) => ({
      method: row.method,
      amount: Number(row.amount),
    })),
  };
}

export async function voidCashSale(input: {
  organizationId: string;
  actorUserId: string;
  saleId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 240) {
    throw new Error("Alasan void wajib 8–240 karakter.");
  }

  const db = getD1();
  const sale = await db
    .prepare(
      "SELECT id, receipt_number, status, total_amount FROM sales WHERE id = ? AND organization_id = ? LIMIT 1",
    )
    .bind(input.saleId, input.organizationId)
    .first<{ id: string; receipt_number: string; status: string; total_amount: number }>();
  if (!sale) throw new Error("Transaksi tidak ditemukan.");
  if (sale.status !== "COMMITTED") throw new Error("Hanya transaksi COMMITTED yang dapat di-void.");

  const payment = await db
    .prepare(
      "SELECT id, method, amount, status FROM payments WHERE organization_id = ? AND sale_id = ? LIMIT 1",
    )
    .bind(input.organizationId, input.saleId)
    .first<{ id: string; method: string; amount: number; status: string }>();
  if (!payment || payment.method !== "CASH" || payment.status !== "CONFIRMED") {
    throw new Error("Void development saat ini hanya mendukung pembayaran tunai terkonfirmasi.");
  }

  const movementResult = await db
    .prepare(
      "SELECT warehouse_id, product_id, unit_cost_amount, quantity_delta FROM inventory_movements WHERE organization_id = ? AND reference_type = 'SALE' AND reference_id = ? AND movement_type = 'SALE'",
    )
    .bind(input.organizationId, input.saleId)
    .all<{ warehouse_id: string; product_id: string; unit_cost_amount: number; quantity_delta: number }>();

  const originalJournal = await db
    .prepare(
      "SELECT jl.account_code, jl.debit_amount, jl.credit_amount, jl.memo FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id WHERE je.organization_id = ? AND je.source_type = 'SALE' AND je.source_id = ? AND je.status = 'POSTED' ORDER BY jl.created_at",
    )
    .bind(input.organizationId, input.saleId)
    .all<{ account_code: string; debit_amount: number; credit_amount: number; memo: string | null }>();
  if (!originalJournal.results.length) throw new Error("Jurnal penjualan asli tidak ditemukan.");

  const existingReversal = await db
    .prepare(
      "SELECT id FROM journal_entries WHERE organization_id = ? AND source_type = 'SALE_VOID' AND source_id = ? LIMIT 1",
    )
    .bind(input.organizationId, input.saleId)
    .first<{ id: string }>();
  if (existingReversal) throw new Error("Jurnal reversal transaksi ini sudah ada.");

  const now = nowIso();
  const journalId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const statements = [];

  statements.push(
    db
      .prepare(
        "UPDATE sales SET status = 'VOIDED', payment_status = 'REFUNDED', voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ? AND organization_id = ? AND status = 'COMMITTED'",
      )
      .bind(now, input.actorUserId, reason, input.saleId, input.organizationId),
  );
  statements.push(
    db
      .prepare("UPDATE payments SET status = 'REVERSED' WHERE id = ? AND organization_id = ? AND status = 'CONFIRMED'")
      .bind(payment.id, input.organizationId),
  );

  for (const movement of movementResult.results) {
    statements.push(
      db
        .prepare(
          "INSERT INTO inventory_movements (id, organization_id, warehouse_id, product_id, movement_type, quantity_delta, unit_cost_amount, batch_code, expiry_date, reference_type, reference_id, actor_user_id, occurred_at, created_at) VALUES (?, ?, ?, ?, 'SALE_VOID', ?, ?, NULL, NULL, 'SALE_VOID', ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          input.organizationId,
          movement.warehouse_id,
          movement.product_id,
          Math.abs(Number(movement.quantity_delta)),
          Number(movement.unit_cost_amount),
          input.saleId,
          input.actorUserId,
          now,
          now,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        "INSERT INTO journal_entries (id, organization_id, entry_number, source_type, source_id, description, status, posted_by, posted_at, created_at) VALUES (?, ?, ?, 'SALE_VOID', ?, ?, 'POSTED', ?, ?, ?)",
      )
      .bind(
        journalId,
        input.organizationId,
        `VOID-${sale.receipt_number}`,
        input.saleId,
        `Reversal void ${sale.receipt_number}`,
        input.actorUserId,
        now,
        now,
      ),
  );

  for (const line of originalJournal.results) {
    statements.push(
      db
        .prepare(
          "INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          journalId,
          line.account_code,
          Number(line.credit_amount),
          Number(line.debit_amount),
          `Reversal: ${line.memo || sale.receipt_number}`,
          now,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        "INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'SALE_VOIDED', 'SALE', ?, ?, ?)",
      )
      .bind(
        auditId,
        input.organizationId,
        input.actorUserId,
        input.saleId,
        JSON.stringify({ receiptNumber: sale.receipt_number, reason, amount: Number(sale.total_amount) }),
        now,
      ),
  );

  await db.batch(statements);
  return { receiptNumber: sale.receipt_number };
}
