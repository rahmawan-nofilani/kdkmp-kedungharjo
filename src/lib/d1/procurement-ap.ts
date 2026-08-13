import { getD1, type D1PreparedLike } from "./context";
import { getPurchaseOrderDetail } from "./procurement";

export type SupplierInvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  purchase_order_id: string;
  po_number: string;
  total_amount: number;
  status: string;
  match_status: string;
  match_note: string | null;
  created_by: string;
  matched_by: string | null;
  approved_by: string | null;
  created_at: string;
  matched_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  paid_amount: number;
  remaining_amount: number;
};

function nowIso() {
  return new Date().toISOString();
}

function entryNumber(prefix: string) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${prefix}-${y}${m}${d}-${suffix}`;
}

export async function listSupplierInvoices(organizationId: string, limit = 100) {
  const db = getD1();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const result = await db
    .prepare(`
      SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
             si.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
             si.purchase_order_id, po.po_number, si.total_amount, si.status,
             si.match_status, si.match_note, si.created_by, si.matched_by,
             si.approved_by, si.created_at, si.matched_at, si.approved_at, si.paid_at,
             COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_invoice_id=si.id AND sp.status='POSTED'),0) AS paid_amount
      FROM supplier_invoices si
      JOIN suppliers s ON s.id=si.supplier_id
      JOIN purchase_orders po ON po.id=si.purchase_order_id
      WHERE si.organization_id=?
      ORDER BY CASE si.status WHEN 'MISMATCH' THEN 0 WHEN 'MATCHED' THEN 1 WHEN 'APPROVED' THEN 2 WHEN 'DRAFT' THEN 3 ELSE 4 END,
               COALESCE(si.due_date, si.invoice_date), si.created_at DESC
      LIMIT ${safeLimit}
    `)
    .bind(organizationId)
    .all<Omit<SupplierInvoiceRow, "remaining_amount">>();

  return result.results.map((row) => {
    const total = Number(row.total_amount);
    const paid = Number(row.paid_amount);
    return { ...row, total_amount: total, paid_amount: paid, remaining_amount: Math.max(0, total - paid) };
  });
}

export async function createSupplierInvoice(input: {
  organizationId: string;
  actorUserId: string;
  purchaseOrderId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  lines: Array<{ purchaseOrderItemId: string; quantityBilled: number; unitCostAmount: number }>;
}) {
  const db = getD1();
  const detail = await getPurchaseOrderDetail(input.organizationId, input.purchaseOrderId);
  if (!detail) throw new Error("Purchase Order tidak ditemukan.");
  if (detail.po.status !== "RECEIVED") throw new Error("Invoice hanya dapat dicatat setelah PO diterima penuh pada fase ini.");
  if (!input.invoiceNumber.trim()) throw new Error("Nomor invoice supplier wajib diisi.");
  if (!input.invoiceDate) throw new Error("Tanggal invoice wajib diisi.");

  const existing = await db
    .prepare("SELECT id FROM supplier_invoices WHERE purchase_order_id=? AND status<>'VOIDED' LIMIT 1")
    .bind(detail.po.id)
    .first<{ id: string }>();
  if (existing) throw new Error("PO ini sudah memiliki invoice aktif. Fase ini menggunakan satu invoice per PO.");

  const itemMap = new Map(detail.items.map((item) => [item.id, item]));
  if (!input.lines.length) throw new Error("Invoice harus mempunyai item.");
  const seen = new Set<string>();
  let total = 0;
  for (const line of input.lines) {
    const item = itemMap.get(line.purchaseOrderItemId);
    if (!item) throw new Error("Item invoice tidak sesuai PO.");
    if (seen.has(line.purchaseOrderItemId)) throw new Error("Item invoice duplikat.");
    seen.add(line.purchaseOrderItemId);
    if (!Number.isInteger(line.quantityBilled) || line.quantityBilled <= 0) throw new Error("Qty invoice harus bilangan bulat positif.");
    if (!Number.isInteger(line.unitCostAmount) || line.unitCostAmount < 0) throw new Error("Harga invoice tidak valid.");
    total += line.quantityBilled * line.unitCostAmount;
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO supplier_invoices (
        id, organization_id, supplier_id, purchase_order_id, invoice_number,
        invoice_date, due_date, subtotal_amount, total_amount, status, match_status,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'PENDING', ?, ?, ?)
    `).bind(
      id, input.organizationId, detail.po.supplier_id, detail.po.id, input.invoiceNumber.trim(),
      input.invoiceDate, input.dueDate || null, total, total, input.actorUserId, now, now,
    ),
  ];

  for (const line of input.lines) {
    const item = itemMap.get(line.purchaseOrderItemId)!;
    statements.push(
      db.prepare(`
        INSERT INTO supplier_invoice_items (
          id, supplier_invoice_id, purchase_order_item_id, product_id,
          quantity_billed, unit_cost_amount, line_total_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), id, item.id, item.product_id,
        line.quantityBilled, line.unitCostAmount, line.quantityBilled * line.unitCostAmount, now,
      ),
    );
  }

  statements.push(
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'SUPPLIER_INVOICE_CREATED', 'SUPPLIER_INVOICE', ?, ?, ?)
    `).bind(
      crypto.randomUUID(), input.organizationId, input.actorUserId, id,
      JSON.stringify({ invoiceNumber: input.invoiceNumber.trim(), purchaseOrderId: detail.po.id, totalAmount: total }), now,
    ),
  );

  await db.batch(statements);
  return id;
}

export async function runThreeWayMatch(input: {
  organizationId: string;
  actorUserId: string;
  invoiceId: string;
}) {
  const db = getD1();
  const invoice = await db
    .prepare(`
      SELECT id, purchase_order_id, total_amount, status
      FROM supplier_invoices WHERE id=? AND organization_id=? LIMIT 1
    `)
    .bind(input.invoiceId, input.organizationId)
    .first<{ id: string; purchase_order_id: string; total_amount: number; status: string }>();
  if (!invoice) throw new Error("Invoice tidak ditemukan.");
  if (!["DRAFT", "MISMATCH", "MATCHED"].includes(invoice.status)) throw new Error("Invoice tidak dapat di-match pada status ini.");

  const rows = await db
    .prepare(`
      SELECT sii.purchase_order_item_id, sii.quantity_billed, sii.unit_cost_amount AS invoice_cost,
             poi.quantity_ordered, poi.unit_cost_amount AS po_cost,
             COALESCE((
               SELECT SUM(gri.quantity_received)
               FROM goods_receipt_items gri
               JOIN goods_receipts gr ON gr.id=gri.goods_receipt_id
               WHERE gri.purchase_order_item_id=poi.id AND gr.status='POSTED'
             ),0) AS received_qty
      FROM supplier_invoice_items sii
      JOIN purchase_order_items poi ON poi.id=sii.purchase_order_item_id
      WHERE sii.supplier_invoice_id=?
      ORDER BY sii.id
    `)
    .bind(invoice.id)
    .all<{ purchase_order_item_id: string; quantity_billed: number; invoice_cost: number; quantity_ordered: number; po_cost: number; received_qty: number }>();

  const issues: string[] = [];
  if (!rows.results.length) issues.push("Invoice tidak mempunyai line.");
  let calculatedTotal = 0;
  for (const row of rows.results) {
    const billed = Number(row.quantity_billed);
    const received = Number(row.received_qty);
    const ordered = Number(row.quantity_ordered);
    const invoiceCost = Number(row.invoice_cost);
    const poCost = Number(row.po_cost);
    calculatedTotal += billed * invoiceCost;
    if (billed !== received) issues.push(`Qty invoice ${billed} tidak sama dengan received ${received}.`);
    if (received !== ordered) issues.push(`Received ${received} belum sama dengan ordered ${ordered}.`);
    if (invoiceCost !== poCost) issues.push(`Harga invoice ${invoiceCost} berbeda dari PO ${poCost}.`);
  }
  if (calculatedTotal !== Number(invoice.total_amount)) issues.push("Total line invoice tidak sama dengan header invoice.");

  const match = issues.length === 0;
  const now = nowIso();
  const nextStatus = match ? "MATCHED" : "MISMATCH";
  const note = match ? "PO, Goods Receipt, dan Supplier Invoice cocok." : issues.slice(0, 8).join(" ");
  await db.batch([
    db.prepare(`
      UPDATE supplier_invoices
      SET status=?, match_status=?, match_note=?, matched_by=?, matched_at=?, updated_at=?
      WHERE id=? AND organization_id=?
    `).bind(nextStatus, match ? "MATCH" : "MISMATCH", note, input.actorUserId, now, now, invoice.id, input.organizationId),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, 'SUPPLIER_INVOICE', ?, ?, ?)
    `).bind(
      crypto.randomUUID(), input.organizationId, input.actorUserId,
      match ? "SUPPLIER_INVOICE_MATCHED" : "SUPPLIER_INVOICE_MISMATCH",
      invoice.id, JSON.stringify({ issues }), now,
    ),
  ]);
  return { match, issues };
}

export async function approveSupplierInvoice(input: {
  organizationId: string;
  actorUserId: string;
  invoiceId: string;
}) {
  const db = getD1();
  const invoice = await db
    .prepare("SELECT id, total_amount, status, match_status, created_by FROM supplier_invoices WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.invoiceId, input.organizationId)
    .first<{ id: string; total_amount: number; status: string; match_status: string; created_by: string }>();
  if (!invoice) throw new Error("Invoice tidak ditemukan.");
  if (invoice.status !== "MATCHED" || invoice.match_status !== "MATCH") throw new Error("Invoice harus lolos 3-Way Match sebelum approval.");
  if (invoice.created_by === input.actorUserId) throw new Error("Maker-checker: pembuat invoice tidak boleh menyetujui invoice sendiri.");

  const total = Number(invoice.total_amount);
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare("UPDATE supplier_invoices SET status='APPROVED', approved_by=?, approved_at=?, updated_at=? WHERE id=? AND status='MATCHED'")
      .bind(input.actorUserId, now, now, invoice.id),
  ];

  if (total > 0) {
    const journalId = crypto.randomUUID();
    statements.push(
      db.prepare(`
        INSERT INTO journal_entries (
          id, organization_id, entry_number, source_type, source_id, description,
          status, posted_by, posted_at, created_at
        ) VALUES (?, ?, ?, 'SUPPLIER_INVOICE', ?, 'Invoice supplier approved', 'POSTED', ?, ?, ?)
      `).bind(journalId, input.organizationId, entryNumber("JRN-INV"), invoice.id, input.actorUserId, now, now),
      db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, '2-1500', ?, 0, 'Clear GRNI', ?)")
        .bind(crypto.randomUUID(), journalId, total, now),
      db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, '2-1000', 0, ?, 'Hutang supplier', ?)")
        .bind(crypto.randomUUID(), journalId, total, now),
    );
  }

  statements.push(
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'SUPPLIER_INVOICE_APPROVED', 'SUPPLIER_INVOICE', ?, ?, ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, invoice.id, JSON.stringify({ totalAmount: total }), now),
  );
  await db.batch(statements);
}

export async function paySupplierInvoice(input: {
  organizationId: string;
  actorUserId: string;
  invoiceId: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER";
  referenceNumber?: string | null;
}) {
  const db = getD1();
  const invoice = await db
    .prepare(`
      SELECT si.id, si.supplier_id, si.total_amount, si.status, si.created_by,
             COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_invoice_id=si.id AND sp.status='POSTED'),0) AS paid_amount
      FROM supplier_invoices si
      WHERE si.id=? AND si.organization_id=? LIMIT 1
    `)
    .bind(input.invoiceId, input.organizationId)
    .first<{ id: string; supplier_id: string; total_amount: number; status: string; created_by: string; paid_amount: number }>();
  if (!invoice) throw new Error("Invoice tidak ditemukan.");
  if (!['APPROVED'].includes(invoice.status)) throw new Error("Hanya invoice APPROVED yang dapat dibayar.");
  if (invoice.created_by === input.actorUserId) throw new Error("Maker-checker: pembuat invoice tidak boleh membayar invoice sendiri.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Nominal pembayaran tidak valid.");
  const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount);
  if (input.amount > remaining) throw new Error(`Pembayaran melebihi sisa hutang Rp${remaining}.`);

  const paymentId = crypto.randomUUID();
  const now = nowIso();
  const nextPaid = Number(invoice.paid_amount) + input.amount;
  const fullyPaid = nextPaid >= Number(invoice.total_amount);
  const journalId = crypto.randomUUID();
  const cashAccount = input.method === "CASH" ? "1-1000" : "1-1100";
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO supplier_payments (
        id, organization_id, supplier_id, supplier_invoice_id, amount, method,
        status, reference_number, paid_by, paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?)
    `).bind(paymentId, input.organizationId, invoice.supplier_id, invoice.id, input.amount, input.method, input.referenceNumber?.trim() || null, input.actorUserId, now, now),
    db.prepare(`
      INSERT INTO journal_entries (
        id, organization_id, entry_number, source_type, source_id, description,
        status, posted_by, posted_at, created_at
      ) VALUES (?, ?, ?, 'SUPPLIER_PAYMENT', ?, 'Pembayaran hutang supplier', 'POSTED', ?, ?, ?)
    `).bind(journalId, input.organizationId, entryNumber("JRN-PAY"), paymentId, input.actorUserId, now, now),
    db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, '2-1000', ?, 0, 'Pelunasan hutang supplier', ?)")
      .bind(crypto.randomUUID(), journalId, input.amount, now),
    db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, ?, 0, ?, 'Kas/Bank keluar', ?)")
      .bind(crypto.randomUUID(), journalId, cashAccount, input.amount, now),
    db.prepare("UPDATE supplier_invoices SET status=?, paid_at=?, updated_at=? WHERE id=?")
      .bind(fullyPaid ? "PAID" : "APPROVED", fullyPaid ? now : null, now, invoice.id),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'SUPPLIER_PAYMENT_POSTED', 'SUPPLIER_INVOICE', ?, ?, ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, invoice.id, JSON.stringify({ paymentId, amount: input.amount, method: input.method, fullyPaid }), now),
  ];
  await db.batch(statements);
  return paymentId;
}
