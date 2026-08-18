import { getD1, type D1PreparedLike } from "./context";

function nowIso() {
  return new Date().toISOString();
}

export async function voidCashSaleControlled(input: {
  organizationId: string;
  actorUserId: string;
  saleId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 240) throw new Error("Alasan void wajib 8–240 karakter.");
  if (!input.saleId.trim()) throw new Error("Transaksi tidak valid.");

  const db = getD1();
  const idempotencyKey = `pos-sale-void:${input.saleId}`;
  const requestHash = JSON.stringify({ saleId: input.saleId, reason });

  const prior = await db.prepare(`
    SELECT request_hash,resource_id FROM request_idempotency
    WHERE organization_id=? AND idempotency_key=? LIMIT 1
  `).bind(input.organizationId,idempotencyKey).first<{request_hash:string|null;resource_id:string|null}>();
  if (prior?.resource_id) {
    if (prior.request_hash !== requestHash) throw new Error("Void transaksi ini sudah diproses dengan alasan berbeda.");
    return { journalId: prior.resource_id, duplicate: true };
  }

  const sale = await db.prepare(`
    SELECT id,receipt_number,teller_user_id,shift_id,status,payment_status,total_amount
    FROM sales WHERE id=? AND organization_id=? LIMIT 1
  `).bind(input.saleId,input.organizationId).first<{
    id:string;receipt_number:string;teller_user_id:string;shift_id:string;status:string;payment_status:string;total_amount:number;
  }>();
  if (!sale) throw new Error("Transaksi tidak ditemukan.");
  if (sale.status !== "COMMITTED" || sale.payment_status !== "PAID") throw new Error("Hanya transaksi COMMITTED/PAID yang dapat di-void.");
  if (sale.teller_user_id === input.actorUserId) throw new Error("Maker-checker: teller transaksi asal tidak boleh melakukan void sendiri.");

  const shift = await db.prepare(`
    SELECT id,status FROM teller_shifts WHERE id=? AND organization_id=? LIMIT 1
  `).bind(sale.shift_id,input.organizationId).first<{id:string;status:string}>();
  if (!shift || shift.status !== "OPEN") {
    throw new Error("Void diblok karena shift transaksi asal sudah ditutup. Gunakan koreksi keuangan terkontrol, jangan mengubah shift historis.");
  }

  const paymentResult = await db.prepare(`
    SELECT id,method,amount,status FROM payments
    WHERE organization_id=? AND sale_id=? ORDER BY created_at
  `).bind(input.organizationId,input.saleId).all<{id:string;method:string;amount:number;status:string}>();
  if (paymentResult.results.length !== 1) throw new Error("Void otomatis hanya mendukung satu pembayaran per struk.");
  const payment = paymentResult.results[0];
  const totalAmount = Number(sale.total_amount);
  if (payment.method !== "CASH" || payment.status !== "CONFIRMED" || Number(payment.amount) !== totalAmount) {
    throw new Error("Void otomatis hanya mendukung pembayaran CASH terkonfirmasi yang sama dengan total struk.");
  }

  const existingReversal = await db.prepare(`
    SELECT id FROM journal_entries
    WHERE organization_id=? AND source_type='SALE_VOID' AND source_id=? LIMIT 1
  `).bind(input.organizationId,input.saleId).first<{id:string}>();
  if (existingReversal) throw new Error("Jurnal reversal transaksi ini sudah ada tetapi idempotency record tidak ditemukan. Periksa integritas sebelum melanjutkan.");

  const movementResult = await db.prepare(`
    SELECT warehouse_id,product_id,unit_cost_amount,quantity_delta
    FROM inventory_movements
    WHERE organization_id=? AND reference_type='SALE' AND reference_id=? AND movement_type='SALE'
    ORDER BY created_at,id
  `).bind(input.organizationId,input.saleId).all<{
    warehouse_id:string;product_id:string;unit_cost_amount:number;quantity_delta:number;
  }>();

  const originalJournal = await db.prepare(`
    SELECT je.id AS journal_id,jl.account_code,jl.debit_amount,jl.credit_amount,jl.memo
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id=je.id
    WHERE je.organization_id=? AND je.source_type='SALE' AND je.source_id=? AND je.status='POSTED'
    ORDER BY jl.created_at,jl.id
  `).bind(input.organizationId,input.saleId).all<{
    journal_id:string;account_code:string;debit_amount:number;credit_amount:number;memo:string|null;
  }>();
  if (originalJournal.results.length < 2) throw new Error("Jurnal penjualan asli tidak lengkap.");
  const originalJournalIds = new Set(originalJournal.results.map(row=>row.journal_id));
  if (originalJournalIds.size !== 1) throw new Error("Lebih dari satu jurnal asal ditemukan untuk penjualan ini.");
  const totalDebit = originalJournal.results.reduce((sum,row)=>sum+Number(row.debit_amount||0),0);
  const totalCredit = originalJournal.results.reduce((sum,row)=>sum+Number(row.credit_amount||0),0);
  if (!Number.isSafeInteger(totalDebit) || totalDebit <= 0 || totalDebit !== totalCredit) throw new Error("Jurnal penjualan asli tidak seimbang.");

  const cashLine = originalJournal.results.find(row =>
    Number(row.debit_amount) === totalAmount && Number(row.credit_amount) === 0 && String(row.memo||"").includes("Kas dari penjualan")
  ) || originalJournal.results.find(row => Number(row.debit_amount) === totalAmount && Number(row.credit_amount) === 0);
  if (!cashLine) throw new Error("Baris Kas jurnal penjualan tidak dapat diidentifikasi.");

  const cashBalanceRow = await db.prepare(`
    SELECT COALESCE(SUM(jl.debit_amount-jl.credit_amount),0) AS balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.organization_id=? AND je.status='POSTED' AND jl.account_code=?
  `).bind(input.organizationId,cashLine.account_code).first<{balance:number}>();
  if (Number(cashBalanceRow?.balance||0) < totalAmount) throw new Error("Saldo Kas tidak cukup untuk refund void transaksi ini.");

  const journalId = crypto.randomUUID();
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO request_idempotency
        (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,'POS_SALE_VOID',?,?,'COMPLETED',?,NULL)
    `).bind(input.organizationId,idempotencyKey,requestHash,journalId,now),
    db.prepare(`
      UPDATE sales
      SET status='VOIDED',payment_status='REFUNDED',voided_at=?,voided_by=?,void_reason=?
      WHERE id=? AND organization_id=? AND status='COMMITTED' AND payment_status='PAID'
    `).bind(now,input.actorUserId,reason,input.saleId,input.organizationId),
    db.prepare(`
      UPDATE payments SET status='REVERSED'
      WHERE id=? AND organization_id=? AND status='CONFIRMED'
    `).bind(payment.id,input.organizationId),
  ];

  for (const movement of movementResult.results) {
    statements.push(db.prepare(`
      INSERT INTO inventory_movements
        (id,organization_id,warehouse_id,product_id,movement_type,quantity_delta,unit_cost_amount,
         batch_code,expiry_date,reference_type,reference_id,actor_user_id,occurred_at,created_at)
      VALUES (?,?,?,?,'SALE_VOID',?,?,NULL,NULL,'SALE_VOID',?,?,?,?)
    `).bind(
      crypto.randomUUID(),input.organizationId,movement.warehouse_id,movement.product_id,
      Math.abs(Number(movement.quantity_delta)),Number(movement.unit_cost_amount),input.saleId,input.actorUserId,now,now,
    ));
  }

  statements.push(db.prepare(`
    INSERT INTO journal_entries
      (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
    VALUES (?,?,?,'SALE_VOID',?,?,'POSTED',?,?,?)
  `).bind(journalId,input.organizationId,`VOID-${sale.receipt_number}`,input.saleId,`Reversal void ${sale.receipt_number}: ${reason}`,input.actorUserId,now,now));

  for (const line of originalJournal.results) {
    statements.push(db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(),journalId,line.account_code,Number(line.credit_amount||0),Number(line.debit_amount||0),
      `REV ${line.journal_id} · ${line.memo||sale.receipt_number}`,now,
    ));
  }

  statements.push(db.prepare(`
    INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'SALE_VOIDED_CONTROLLED','SALE',?,?,?)
  `).bind(crypto.randomUUID(),input.organizationId,input.actorUserId,input.saleId,JSON.stringify({
    receiptNumber:sale.receipt_number,
    originalTellerUserId:sale.teller_user_id,
    shiftId:sale.shift_id,
    paymentId:payment.id,
    paymentMethod:payment.method,
    amount:totalAmount,
    cashAccountCode:cashLine.account_code,
    originalJournalEntryId:Array.from(originalJournalIds)[0],
    reversalJournalEntryId:journalId,
    reason,
    makerChecker:true,
  }),now));

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ACCOUNTING_PERIOD_CLOSED")) throw new Error("Periode akuntansi sudah CLOSED/LOCKED; void tidak boleh diposting ke periode tersebut.");
    if (message.includes("request_idempotency") || message.includes("UNIQUE constraint")) {
      const retry = await db.prepare(`
        SELECT request_hash,resource_id FROM request_idempotency
        WHERE organization_id=? AND idempotency_key=? LIMIT 1
      `).bind(input.organizationId,idempotencyKey).first<{request_hash:string|null;resource_id:string|null}>();
      if (retry?.resource_id && retry.request_hash === requestHash) return { journalId: retry.resource_id, duplicate: true };
      throw new Error("Void duplikat dicegah. Muat ulang struk untuk melihat hasil terakhir.");
    }
    throw error;
  }

  return { journalId, duplicate: false };
}
