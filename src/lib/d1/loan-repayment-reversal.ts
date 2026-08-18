import { getD1, type D1PreparedLike } from "./context";
import { ensureTreasuryFoundation } from "./treasury";

function nowIso() { return new Date().toISOString(); }

function documentNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `LRV-${stamp}-${random}`;
}

export async function postLoanRepaymentReversal(input: {
  organizationId: string;
  actorUserId: string;
  reversalId: string;
  repaymentId: string;
  originalJournalEntryId: string;
  treasuryAccountId: string;
  reason: string;
}) {
  await ensureTreasuryFoundation(input.organizationId);
  const db = getD1();
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 500) throw new Error("Alasan reversal harus 8–500 karakter.");

  const idempotencyKey = `loan-repayment-reversal:${input.reversalId}`;
  const requestHash = JSON.stringify({
    reversalId: input.reversalId,
    repaymentId: input.repaymentId,
    originalJournalEntryId: input.originalJournalEntryId,
    treasuryAccountId: input.treasuryAccountId,
  });
  const existing = await db.prepare(`
    SELECT request_hash,resource_id FROM request_idempotency
    WHERE organization_id=? AND idempotency_key=? LIMIT 1
  `).bind(input.organizationId, idempotencyKey).first<{ request_hash:string; resource_id:string|null }>();
  if (existing?.resource_id) {
    if (existing.request_hash !== requestHash) throw new Error("Idempotency reversal sudah dipakai dengan payload berbeda.");
    return existing.resource_id;
  }

  const original = await db.prepare(`
    SELECT id,status,source_type,source_id FROM journal_entries
    WHERE id=? AND organization_id=? LIMIT 1
  `).bind(input.originalJournalEntryId, input.organizationId)
    .first<{ id:string; status:string; source_type:string; source_id:string }>();
  if (!original || original.status !== "POSTED" || original.source_type !== "LOAN_REPAYMENT" || original.source_id !== input.repaymentId) {
    throw new Error("Jurnal angsuran asal tidak valid untuk reversal.");
  }

  const linesResult = await db.prepare(`
    SELECT account_code,debit_amount,credit_amount,memo
    FROM journal_lines WHERE journal_entry_id=? ORDER BY created_at,id
  `).bind(original.id).all<{ account_code:string; debit_amount:number; credit_amount:number; memo:string|null }>();
  const lines = linesResult.results;
  if (lines.length < 2) throw new Error("Jurnal angsuran asal tidak lengkap.");
  const totalDebit = lines.reduce((sum,row)=>sum+Number(row.debit_amount||0),0);
  const totalCredit = lines.reduce((sum,row)=>sum+Number(row.credit_amount||0),0);
  if (!Number.isSafeInteger(totalDebit) || totalDebit <= 0 || totalDebit !== totalCredit) throw new Error("Jurnal angsuran asal tidak seimbang.");

  const treasury = await db.prepare(`
    SELECT ta.id,ta.status,ca.code AS chart_code,ca.status AS chart_status
    FROM treasury_accounts ta JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.id=? AND ta.organization_id=? LIMIT 1
  `).bind(input.treasuryAccountId,input.organizationId)
    .first<{ id:string; status:string; chart_code:string; chart_status:string }>();
  if (!treasury || treasury.status !== "ACTIVE" || treasury.chart_status !== "ACTIVE") throw new Error("Kas/Bank reversal tidak aktif.");
  const originalTreasuryDebit = lines.filter(row=>row.account_code===treasury.chart_code).reduce((sum,row)=>sum+Number(row.debit_amount||0),0);
  if (originalTreasuryDebit <= 0) throw new Error("Treasury reversal tidak sama dengan treasury jurnal asal.");

  const treasuryBalanceRow = await db.prepare(`
    SELECT COALESCE(SUM(jl.debit_amount-jl.credit_amount),0) AS balance
    FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.organization_id=? AND je.status='POSTED' AND jl.account_code=?
  `).bind(input.organizationId,treasury.chart_code).first<{ balance:number }>();
  const treasuryBalance = Number(treasuryBalanceRow?.balance||0);
  if (treasuryBalance < originalTreasuryDebit) throw new Error("Saldo Kas/Bank tidak cukup untuk reversal angsuran.");

  const journalId = crypto.randomUUID();
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`INSERT INTO request_idempotency
      (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,'LOAN_REPAYMENT_REVERSAL',?,?,'COMPLETED',?,NULL)`)
      .bind(input.organizationId,idempotencyKey,requestHash,journalId,now),
    db.prepare(`INSERT INTO journal_entries
      (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'LOAN_REPAYMENT_REVERSAL',?,?,'POSTED',?,?,?)`)
      .bind(journalId,input.organizationId,`JRN-${documentNumber()}`,input.reversalId,`Reversal angsuran ${input.repaymentId}: ${reason}`,input.actorUserId,now,now),
  ];

  for (const row of lines) {
    statements.push(db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),journalId,row.account_code,Number(row.credit_amount||0),Number(row.debit_amount||0),`REV ${input.originalJournalEntryId} · ${row.memo||reason}`,now));
  }
  statements.push(db.prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'LOAN_REPAYMENT_REVERSED','LOAN_REPAYMENT_REVERSAL',?,?,?)`)
    .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,input.reversalId,JSON.stringify({repaymentId:input.repaymentId,originalJournalEntryId:input.originalJournalEntryId,reversalJournalEntryId:journalId,treasuryAccountId:input.treasuryAccountId,amount:totalDebit,reason}),now));

  try { await db.batch(statements); }
  catch (error) {
    const message=error instanceof Error?error.message:String(error);
    if(message.includes("ACCOUNTING_PERIOD_CLOSED")) throw new Error("Periode akuntansi reversal sudah CLOSED/LOCKED.");
    if(message.includes("request_idempotency")||message.includes("UNIQUE constraint")){
      const retry=await db.prepare(`SELECT request_hash,resource_id FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1`)
        .bind(input.organizationId,idempotencyKey).first<{request_hash:string;resource_id:string|null}>();
      if(retry?.resource_id&&retry.request_hash===requestHash)return retry.resource_id;
      throw new Error("Reversal duplikat dicegah oleh D1.");
    }
    throw error;
  }
  return journalId;
}
