import { getD1, type D1PreparedLike } from "./context";

export type ControlledJournalRow = {
  id: string;
  journal_number: string;
  journal_date: string;
  journal_type: "MANUAL" | "OPENING";
  description: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED" | "CANCELLED" | "REVERSED";
  created_by: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  posted_by: string | null;
  posted_at: string | null;
  journal_entry_id: string | null;
  reversed_by: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  reversal_journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  line_count: number;
  total_debit: number;
  total_credit: number;
};

export type ControlledJournalLineRow = {
  id: string;
  line_no: number;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit_amount: number;
  credit_amount: number;
  memo: string | null;
};

type DraftLineInput = {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  memo?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function docNumber(type: "MANUAL" | "OPENING") {
  const prefix = type === "OPENING" ? "OB" : "MJ";
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00+07:00`));
}

function postingIso(date: string) {
  if (!validDate(date)) throw new Error("Tanggal jurnal tidak valid.");
  return new Date(Date.parse(`${date}T12:00:00+07:00`)).toISOString();
}

function cleanText(value: string, min: number, max: number, label: string) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`${label} harus ${min}–${max} karakter.`);
  return text;
}

function normalizeLines(lines: DraftLineInput[]) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 50) throw new Error("Jurnal harus memiliki 2–50 baris.");
  const seen = new Set<string>();
  return lines.map((line) => {
    const accountId = String(line.accountId || "").trim();
    const debit = Math.trunc(Number(line.debitAmount || 0));
    const credit = Math.trunc(Number(line.creditAmount || 0));
    if (!accountId) throw new Error("Akun jurnal wajib dipilih.");
    if (seen.has(accountId)) throw new Error("Satu akun cukup satu baris pada controlled journal development.");
    seen.add(accountId);
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0) throw new Error("Nominal debit/kredit tidak valid.");
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) throw new Error("Setiap baris harus berisi Debit atau Kredit, bukan keduanya.");
    const memo = String(line.memo || "").trim();
    if (memo.length > 160) throw new Error("Memo maksimal 160 karakter.");
    return { accountId, debitAmount: debit, creditAmount: credit, memo: memo || null };
  });
}

export async function listControlledJournals(organizationId: string, limit = 120) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT cj.id,cj.journal_number,cj.journal_date,cj.journal_type,cj.description,cj.status,
           cj.created_by,cj.submitted_by,cj.submitted_at,cj.approved_by,cj.approved_at,
           cj.rejected_by,cj.rejected_at,cj.rejection_reason,cj.posted_by,cj.posted_at,
           cj.journal_entry_id,cj.reversed_by,cj.reversed_at,cj.reversal_reason,cj.reversal_journal_entry_id,
           cj.created_at,cj.updated_at,
           COUNT(cjl.id) AS line_count,
           COALESCE(SUM(cjl.debit_amount),0) AS total_debit,
           COALESCE(SUM(cjl.credit_amount),0) AS total_credit
    FROM controlled_journals cj
    LEFT JOIN controlled_journal_lines cjl ON cjl.controlled_journal_id=cj.id
    WHERE cj.organization_id=?
    GROUP BY cj.id
    ORDER BY cj.journal_date DESC,cj.created_at DESC
    LIMIT ${safeLimit}
  `).bind(organizationId).all<ControlledJournalRow>();
  return result.results.map((row) => ({
    ...row,
    line_count: Number(row.line_count),
    total_debit: Number(row.total_debit),
    total_credit: Number(row.total_credit),
  }));
}

export async function getControlledJournalDetail(organizationId: string, id: string) {
  const db = getD1();
  const header = await db.prepare(`
    SELECT cj.id,cj.journal_number,cj.journal_date,cj.journal_type,cj.description,cj.status,
           cj.created_by,cj.submitted_by,cj.submitted_at,cj.approved_by,cj.approved_at,
           cj.rejected_by,cj.rejected_at,cj.rejection_reason,cj.posted_by,cj.posted_at,
           cj.journal_entry_id,cj.reversed_by,cj.reversed_at,cj.reversal_reason,cj.reversal_journal_entry_id,
           cj.created_at,cj.updated_at,
           COUNT(cjl.id) AS line_count,COALESCE(SUM(cjl.debit_amount),0) AS total_debit,
           COALESCE(SUM(cjl.credit_amount),0) AS total_credit
    FROM controlled_journals cj LEFT JOIN controlled_journal_lines cjl ON cjl.controlled_journal_id=cj.id
    WHERE cj.id=? AND cj.organization_id=? GROUP BY cj.id LIMIT 1
  `).bind(id, organizationId).first<ControlledJournalRow>();
  if (!header) return null;
  const lines = await db.prepare(`
    SELECT cjl.id,cjl.line_no,cjl.account_id,ca.code AS account_code,ca.name AS account_name,
           ca.account_type,cjl.debit_amount,cjl.credit_amount,cjl.memo
    FROM controlled_journal_lines cjl
    JOIN chart_of_accounts ca ON ca.id=cjl.account_id
    WHERE cjl.controlled_journal_id=? ORDER BY cjl.line_no
  `).bind(id).all<ControlledJournalLineRow>();
  return {
    header: {
      ...header,
      line_count: Number(header.line_count),
      total_debit: Number(header.total_debit),
      total_credit: Number(header.total_credit),
    },
    lines: lines.results.map((line) => ({ ...line, line_no: Number(line.line_no), debit_amount: Number(line.debit_amount), credit_amount: Number(line.credit_amount) })),
  };
}

export async function createControlledJournal(input: {
  organizationId: string;
  actorUserId: string;
  journalDate: string;
  journalType: "MANUAL" | "OPENING";
  description: string;
}) {
  if (!validDate(input.journalDate)) throw new Error("Tanggal jurnal tidak valid.");
  if (!['MANUAL','OPENING'].includes(input.journalType)) throw new Error("Jenis jurnal tidak valid.");
  const description = cleanText(input.description, 5, 180, "Deskripsi jurnal");
  const db = getD1();
  if (input.journalType === 'OPENING') {
    const active = await db.prepare(`
      SELECT id,status FROM controlled_journals
      WHERE organization_id=? AND journal_type='OPENING'
        AND status IN ('DRAFT','SUBMITTED','APPROVED','POSTED') LIMIT 1
    `).bind(input.organizationId).first<{ id: string; status: string }>();
    if (active) throw new Error(`Opening Balance aktif sudah ada (${active.status}). Selesaikan/reversal jurnal tersebut lebih dulu.`);
  }
  const id = crypto.randomUUID();
  const number = docNumber(input.journalType);
  const now = nowIso();
  await db.batch([
    db.prepare(`INSERT INTO controlled_journals
      (id,organization_id,journal_number,journal_date,journal_type,description,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'DRAFT',?,?,?)`)
      .bind(id,input.organizationId,number,input.journalDate,input.journalType,description,input.actorUserId,now,now),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'CONTROLLED_JOURNAL_CREATED','CONTROLLED_JOURNAL',?,?,?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,id,JSON.stringify({ journalNumber:number,journalType:input.journalType,journalDate:input.journalDate }),now),
  ]);
  return id;
}

export async function saveControlledJournalDraft(input: {
  organizationId: string;
  actorUserId: string;
  journalId: string;
  journalDate: string;
  description: string;
  lines: DraftLineInput[];
}) {
  if (!validDate(input.journalDate)) throw new Error("Tanggal jurnal tidak valid.");
  const description = cleanText(input.description, 5, 180, "Deskripsi jurnal");
  const normalized = normalizeLines(input.lines);
  const db = getD1();
  const journal = await db.prepare(`
    SELECT id,journal_type,status,created_by FROM controlled_journals
    WHERE id=? AND organization_id=? LIMIT 1
  `).bind(input.journalId,input.organizationId).first<{ id:string;journal_type:"MANUAL"|"OPENING";status:string;created_by:string }>();
  if (!journal || journal.status !== 'DRAFT') throw new Error("Hanya jurnal DRAFT yang dapat diedit.");
  if (journal.created_by !== input.actorUserId) throw new Error("Hanya pembuat jurnal yang dapat mengubah DRAFT.");

  const ids = normalized.map((line) => line.accountId);
  const placeholders = ids.map(() => '?').join(',');
  const accounts = await db.prepare(`
    SELECT id,code,name,account_type,status FROM chart_of_accounts
    WHERE organization_id=? AND id IN (${placeholders})
  `).bind(input.organizationId,...ids).all<{ id:string;code:string;name:string;account_type:string;status:string }>();
  if (accounts.results.length !== ids.length) throw new Error("Ada akun jurnal yang tidak ditemukan.");
  const byId = new Map(accounts.results.map((account) => [account.id,account]));
  for (const line of normalized) {
    const account = byId.get(line.accountId)!;
    if (account.status !== 'ACTIVE') throw new Error(`Akun ${account.code} sudah tidak aktif.`);
    if (journal.journal_type === 'OPENING' && !['ASSET','LIABILITY','EQUITY'].includes(account.account_type)) {
      throw new Error(`Opening Balance tidak boleh memakai akun ${account.account_type} (${account.code}).`);
    }
  }

  const totalDebit = normalized.reduce((sum,line) => sum + line.debitAmount,0);
  const totalCredit = normalized.reduce((sum,line) => sum + line.creditAmount,0);
  if (totalDebit !== totalCredit || totalDebit <= 0) throw new Error(`Jurnal belum balance. Debit Rp${totalDebit}, Kredit Rp${totalCredit}.`);
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare("DELETE FROM controlled_journal_lines WHERE controlled_journal_id=?").bind(journal.id),
    db.prepare("UPDATE controlled_journals SET journal_date=?,description=?,updated_at=? WHERE id=? AND organization_id=? AND status='DRAFT'")
      .bind(input.journalDate,description,now,journal.id,input.organizationId),
  ];
  normalized.forEach((line,index) => {
    statements.push(db.prepare(`INSERT INTO controlled_journal_lines
      (id,controlled_journal_id,line_no,account_id,debit_amount,credit_amount,memo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),journal.id,index+1,line.accountId,line.debitAmount,line.creditAmount,line.memo,now,now));
  });
  statements.push(db.prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'CONTROLLED_JOURNAL_DRAFT_SAVED','CONTROLLED_JOURNAL',?,?,?)`)
    .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,journal.id,JSON.stringify({ lines:normalized.length,totalDebit,totalCredit,journalDate:input.journalDate }),now));
  await db.batch(statements);
}

export async function submitControlledJournal(input:{organizationId:string;actorUserId:string;journalId:string}) {
  const db=getD1();
  const journal=await db.prepare("SELECT id,status,created_by,journal_number FROM controlled_journals WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.journalId,input.organizationId).first<{id:string;status:string;created_by:string;journal_number:string}>();
  if(!journal||journal.status!=='DRAFT') throw new Error("Hanya DRAFT yang dapat disubmit.");
  if(journal.created_by!==input.actorUserId) throw new Error("Hanya pembuat jurnal yang dapat submit.");
  const now=nowIso();
  try {
    await db.batch([
      db.prepare("UPDATE controlled_journals SET status='SUBMITTED',submitted_by=?,submitted_at=?,updated_at=? WHERE id=? AND status='DRAFT'")
        .bind(input.actorUserId,now,now,journal.id),
      db.prepare(`INSERT INTO transaction_audit_events
        (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
        VALUES (?,?,?,'CONTROLLED_JOURNAL_SUBMITTED','CONTROLLED_JOURNAL',?,'{}',?)`)
        .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,journal.id,now),
    ]);
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    if(message.includes('CONTROLLED_JOURNAL_UNBALANCED')) throw new Error("Jurnal tidak balance dan belum dapat disubmit.");
    if(message.includes('CONTROLLED_JOURNAL_MIN_LINES')) throw new Error("Jurnal minimal dua baris.");
    throw error;
  }
}

export async function rejectControlledJournal(input:{organizationId:string;actorUserId:string;journalId:string;reason:string}) {
  const reason=cleanText(input.reason,8,240,"Alasan reject");
  const db=getD1();
  const journal=await db.prepare("SELECT id,status,created_by FROM controlled_journals WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.journalId,input.organizationId).first<{id:string;status:string;created_by:string}>();
  if(!journal||journal.status!=='SUBMITTED') throw new Error("Hanya jurnal SUBMITTED yang dapat ditolak.");
  if(journal.created_by===input.actorUserId) throw new Error("Maker tidak boleh menolak jurnalnya sendiri sebagai approver.");
  const now=nowIso();
  await db.batch([
    db.prepare("UPDATE controlled_journals SET status='REJECTED',rejected_by=?,rejected_at=?,rejection_reason=?,updated_at=? WHERE id=? AND status='SUBMITTED'")
      .bind(input.actorUserId,now,reason,now,journal.id),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'CONTROLLED_JOURNAL_REJECTED','CONTROLLED_JOURNAL',?,?,?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,journal.id,JSON.stringify({reason}),now),
  ]);
}

export async function approveAndPostControlledJournal(input:{organizationId:string;actorUserId:string;journalId:string}) {
  const db=getD1();
  const detail=await getControlledJournalDetail(input.organizationId,input.journalId);
  if(!detail||detail.header.status!=='SUBMITTED') throw new Error("Hanya jurnal SUBMITTED yang dapat di-approve.");
  if(detail.header.created_by===input.actorUserId) throw new Error("Maker-checker: pembuat jurnal tidak boleh meng-approve jurnal sendiri.");
  if(detail.header.total_debit<=0||detail.header.total_debit!==detail.header.total_credit||detail.lines.length<2) throw new Error("Jurnal tidak balance.");
  const postedAt=postingIso(detail.header.journal_date);
  const journalEntryId=crypto.randomUUID();
  const now=nowIso();
  const sourceType=detail.header.journal_type==='OPENING'?'OPENING_BALANCE':'CONTROLLED_JOURNAL';
  const statements:D1PreparedLike[]=[
    db.prepare("UPDATE controlled_journals SET status='APPROVED',approved_by=?,approved_at=?,updated_at=? WHERE id=? AND status='SUBMITTED'")
      .bind(input.actorUserId,now,now,detail.header.id),
    db.prepare(`INSERT INTO journal_entries
      (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,?,?,?,'POSTED',?,?,?)`)
      .bind(journalEntryId,input.organizationId,`JRN-${detail.header.journal_number}`,sourceType,detail.header.id,detail.header.description,input.actorUserId,postedAt,now),
  ];
  for(const line of detail.lines){
    statements.push(db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),journalEntryId,line.account_code,line.debit_amount,line.credit_amount,line.memo,now));
  }
  statements.push(
    db.prepare("UPDATE controlled_journals SET status='POSTED',posted_by=?,posted_at=?,journal_entry_id=?,updated_at=? WHERE id=? AND status='APPROVED'")
      .bind(input.actorUserId,now,journalEntryId,now,detail.header.id),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'CONTROLLED_JOURNAL_POSTED','CONTROLLED_JOURNAL',?,?,?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,detail.header.id,JSON.stringify({journalEntryId,journalType:detail.header.journal_type,journalDate:detail.header.journal_date,total:detail.header.total_debit}),now),
  );
  try{await db.batch(statements);}catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(message.includes('CONTROLLED_JOURNAL_MAKER_CHECKER')) throw new Error("Maker-checker menolak approval oleh pembuat jurnal.");
    if(message.includes('ACCOUNTING_PERIOD_CLOSED')) throw new Error("Tanggal jurnal berada pada periode CLOSED/LOCKED.");
    if(message.includes('controlled_opening_posted_uq')||message.includes('UNIQUE constraint')) throw new Error("Opening Balance POSTED aktif sudah tersedia.");
    throw error;
  }
  return journalEntryId;
}

export async function reverseControlledJournal(input:{organizationId:string;actorUserId:string;journalId:string;reason:string;reversalDate:string}) {
  const reason=cleanText(input.reason,8,240,"Alasan reversal");
  const reversalPostedAt=postingIso(input.reversalDate);
  const db=getD1();
  const detail=await getControlledJournalDetail(input.organizationId,input.journalId);
  if(!detail||detail.header.status!=='POSTED'||!detail.header.journal_entry_id) throw new Error("Hanya controlled journal POSTED yang dapat direversal.");
  const original=await db.prepare(`SELECT jl.account_code,jl.debit_amount,jl.credit_amount,jl.memo
    FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.id=? AND je.organization_id=? AND je.status='POSTED' ORDER BY jl.created_at,jl.id`)
    .bind(detail.header.journal_entry_id,input.organizationId).all<{account_code:string;debit_amount:number;credit_amount:number;memo:string|null}>();
  if(original.results.length<2) throw new Error("Journal entry asli tidak lengkap.");
  const reversalId=crypto.randomUUID();
  const now=nowIso();
  const statements:D1PreparedLike[]=[
    db.prepare(`INSERT INTO journal_entries
      (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'CONTROLLED_JOURNAL_REVERSAL',?,?, 'POSTED',?,?,?)`)
      .bind(reversalId,input.organizationId,`REV-${detail.header.journal_number}`,detail.header.id,`Reversal ${detail.header.journal_number}: ${reason}`,input.actorUserId,reversalPostedAt,now),
  ];
  for(const line of original.results){
    statements.push(db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),reversalId,line.account_code,Number(line.credit_amount),Number(line.debit_amount),`Reversal: ${line.memo||detail.header.description}`,now));
  }
  statements.push(
    db.prepare("UPDATE controlled_journals SET status='REVERSED',reversed_by=?,reversed_at=?,reversal_reason=?,reversal_journal_entry_id=?,updated_at=? WHERE id=? AND status='POSTED'")
      .bind(input.actorUserId,now,reason,reversalId,now,detail.header.id),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'CONTROLLED_JOURNAL_REVERSED','CONTROLLED_JOURNAL',?,?,?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,detail.header.id,JSON.stringify({reversalId,reason,reversalDate:input.reversalDate}),now),
  );
  try{await db.batch(statements);}catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(message.includes('ACCOUNTING_PERIOD_CLOSED')) throw new Error("Tanggal reversal berada pada periode CLOSED/LOCKED.");
    throw error;
  }
  return reversalId;
}

export async function cancelControlledJournal(input:{organizationId:string;actorUserId:string;journalId:string}){
  const db=getD1();
  const row=await db.prepare("SELECT id,status,created_by FROM controlled_journals WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.journalId,input.organizationId).first<{id:string;status:string;created_by:string}>();
  if(!row||row.status!=='DRAFT'||row.created_by!==input.actorUserId) throw new Error("Hanya pembuat yang dapat membatalkan DRAFT.");
  const now=nowIso();
  await db.batch([
    db.prepare("UPDATE controlled_journals SET status='CANCELLED',updated_at=? WHERE id=? AND status='DRAFT'").bind(now,row.id),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'CONTROLLED_JOURNAL_CANCELLED','CONTROLLED_JOURNAL',?,'{}',?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,row.id,now),
  ]);
}
