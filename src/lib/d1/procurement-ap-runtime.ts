import { resolveAccountingMapping } from "./accounting-runtime";
import { getD1, type D1PreparedLike } from "./context";

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

export async function approveSupplierInvoiceWithMapping(input: {
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

  const mapping = await resolveAccountingMapping(input.organizationId, "SUPPLIER_INVOICE_APPROVED");
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
      db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, ?, ?, 0, 'Clear GRNI', ?)")
        .bind(crypto.randomUUID(), journalId, mapping.debit_code, total, now),
      db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, ?, 0, ?, 'Hutang supplier', ?)")
        .bind(crypto.randomUUID(), journalId, mapping.credit_code, total, now),
    );
  }

  statements.push(
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'SUPPLIER_INVOICE_APPROVED', 'SUPPLIER_INVOICE', ?, ?, ?)
    `).bind(
      crypto.randomUUID(), input.organizationId, input.actorUserId, invoice.id,
      JSON.stringify({ totalAmount: total, accountingMapping: mapping }), now,
    ),
  );
  await db.batch(statements);
}

export async function paySupplierInvoiceWithMapping(input: {
  organizationId: string;
  actorUserId: string;
  invoiceId: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER";
  referenceNumber?: string | null;
}) {
  const db = getD1();
  const invoice = await db.prepare(`
    SELECT si.id, si.supplier_id, si.total_amount, si.status, si.created_by,
           COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_invoice_id=si.id AND sp.status='POSTED'),0) AS paid_amount
    FROM supplier_invoices si
    WHERE si.id=? AND si.organization_id=? LIMIT 1
  `).bind(input.invoiceId, input.organizationId)
    .first<{ id: string; supplier_id: string; total_amount: number; status: string; created_by: string; paid_amount: number }>();
  if (!invoice) throw new Error("Invoice tidak ditemukan.");
  if (invoice.status !== "APPROVED") throw new Error("Hanya invoice APPROVED yang dapat dibayar.");
  if (invoice.created_by === input.actorUserId) throw new Error("Maker-checker: pembuat invoice tidak boleh membayar invoice sendiri.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Nominal pembayaran tidak valid.");
  const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount);
  if (input.amount > remaining) throw new Error(`Pembayaran melebihi sisa hutang Rp${remaining}.`);

  const eventCode = input.method === "CASH" ? "SUPPLIER_PAYMENT_CASH" : "SUPPLIER_PAYMENT_BANK";
  const mapping = await resolveAccountingMapping(input.organizationId, eventCode);
  const paymentId = crypto.randomUUID();
  const now = nowIso();
  const nextPaid = Number(invoice.paid_amount) + input.amount;
  const fullyPaid = nextPaid >= Number(invoice.total_amount);
  const journalId = crypto.randomUUID();
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
    db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, ?, ?, 0, 'Pelunasan hutang supplier', ?)")
      .bind(crypto.randomUUID(), journalId, mapping.debit_code, input.amount, now),
    db.prepare("INSERT INTO journal_lines (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at) VALUES (?, ?, ?, 0, ?, 'Kas/Bank keluar', ?)")
      .bind(crypto.randomUUID(), journalId, mapping.credit_code, input.amount, now),
    db.prepare("UPDATE supplier_invoices SET status=?, paid_at=?, updated_at=? WHERE id=?")
      .bind(fullyPaid ? "PAID" : "APPROVED", fullyPaid ? now : null, now, invoice.id),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'SUPPLIER_PAYMENT_POSTED', 'SUPPLIER_INVOICE', ?, ?, ?)
    `).bind(
      crypto.randomUUID(), input.organizationId, input.actorUserId, invoice.id,
      JSON.stringify({ paymentId, amount: input.amount, method: input.method, fullyPaid, accountingMapping: mapping }), now,
    ),
  ];
  await db.batch(statements);
  return paymentId;
}
