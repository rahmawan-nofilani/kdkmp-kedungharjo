import { getD1, type D1PreparedLike } from "./context";
import { ensureTreasuryFoundation } from "./treasury";

export type LoanDisbursementChannel = "CASH" | "BANK_TRANSFER";

function nowIso() {
  return new Date().toISOString();
}

function documentNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `LD-${stamp}-${random}`;
}

function safeText(value: string, min: number, max: number, label: string) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`${label} harus ${min}–${max} karakter.`);
  return text;
}

async function ensureLoanReceivableAccount(organizationId: string) {
  const db = getD1();
  const id = `acct:${organizationId}:1-1200`;
  const now = nowIso();
  await db.prepare(`
    INSERT OR IGNORE INTO chart_of_accounts (
      id, organization_id, code, name, account_type, normal_balance,
      parent_account_id, status, is_system, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, '1-1200', 'Piutang Pinjaman Anggota', 'ASSET', 'DEBIT',
              NULL, 'ACTIVE', 1, 'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
  `).bind(id, organizationId, now, now).run();
  const account = await db.prepare(`
    SELECT id,code,status,account_type FROM chart_of_accounts
    WHERE organization_id=? AND code='1-1200' LIMIT 1
  `).bind(organizationId).first<{ id: string; code: string; status: string; account_type: string }>();
  if (!account || account.status !== "ACTIVE" || account.account_type !== "ASSET") {
    throw new Error("Akun Piutang Pinjaman 1-1200 belum siap.");
  }
  return account;
}

export async function postLoanDisbursement(input: {
  organizationId: string;
  actorUserId: string;
  disbursementId: string;
  treasuryAccountId: string;
  channel: LoanDisbursementChannel;
  amount: number;
  accountingEventCode: string;
  referenceNumber: string;
  description: string;
}) {
  await ensureTreasuryFoundation(input.organizationId);
  const receivable = await ensureLoanReceivableAccount(input.organizationId);
  const db = getD1();

  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Nominal pencairan tidak valid.");
  if (!["CASH", "BANK_TRANSFER"].includes(input.channel)) throw new Error("Kanal pencairan tidak valid.");
  if (!/^[A-Z0-9_]{3,80}$/.test(input.accountingEventCode)) throw new Error("Kode event accounting pencairan tidak valid.");
  const referenceNumber = safeText(input.referenceNumber, 3, 120, "Referensi pencairan");
  const description = safeText(input.description, 5, 180, "Keterangan pencairan");
  const idempotencyKey = `loan-disbursement:${input.disbursementId}`;
  const requestHash = JSON.stringify({
    disbursementId: input.disbursementId,
    treasuryAccountId: input.treasuryAccountId,
    channel: input.channel,
    amount: input.amount,
    accountingEventCode: input.accountingEventCode,
    referenceNumber,
  });

  const existing = await db.prepare(`
    SELECT request_hash,resource_id FROM request_idempotency
    WHERE organization_id=? AND idempotency_key=? LIMIT 1
  `).bind(input.organizationId, idempotencyKey).first<{ request_hash: string; resource_id: string | null }>();
  if (existing?.resource_id) {
    if (existing.request_hash !== requestHash) throw new Error("Idempotency key pencairan sudah dipakai dengan payload berbeda.");
    return existing.resource_id;
  }

  const treasury = await db.prepare(`
    SELECT ta.id,ta.status,ta.account_type,ca.code AS chart_code,ca.status AS chart_status
    FROM treasury_accounts ta
    JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.id=? AND ta.organization_id=? LIMIT 1
  `).bind(input.treasuryAccountId, input.organizationId)
    .first<{ id: string; status: string; account_type: string; chart_code: string; chart_status: string }>();
  if (!treasury || treasury.status !== "ACTIVE" || treasury.chart_status !== "ACTIVE") throw new Error("Kas/Bank pencairan tidak aktif.");
  const expectedType = input.channel === "CASH" ? "CASH" : "BANK";
  if (treasury.account_type !== expectedType) throw new Error(input.channel === "CASH" ? "Pencairan CASH harus memakai treasury CASH." : "Pencairan BANK_TRANSFER harus memakai treasury BANK.");

  const balance = await db.prepare(`
    SELECT COALESCE(SUM(jl.debit_amount-jl.credit_amount),0) AS balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.organization_id=? AND je.status='POSTED' AND jl.account_code=?
  `).bind(input.organizationId, treasury.chart_code).first<{ balance: number }>();
  if (Number(balance?.balance ?? 0) < input.amount) throw new Error("Saldo kas/bank tidak cukup untuk pencairan ini.");

  const journalId = crypto.randomUUID();
  const number = documentNumber();
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO request_idempotency
        (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,'LOAN_DISBURSEMENT',?,?,'COMPLETED',?,NULL)
    `).bind(input.organizationId, idempotencyKey, requestHash, journalId, now),
    db.prepare(`
      INSERT INTO journal_entries
        (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'LOAN_DISBURSEMENT',?,?,'POSTED',?,?,?)
    `).bind(journalId, input.organizationId, `JRN-${number}`, input.disbursementId, description, input.actorUserId, now, now),
    db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,0,?,?)
    `).bind(crypto.randomUUID(), journalId, receivable.code, input.amount, `${input.accountingEventCode} · ${description}`, now),
    db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,0,?,?,?)
    `).bind(crypto.randomUUID(), journalId, treasury.chart_code, input.amount, `${referenceNumber} · ${description}`, now),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'LOAN_DISBURSEMENT_POSTED','LOAN_DISBURSEMENT',?,?,?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, input.disbursementId, JSON.stringify({
      journalId,
      referenceNumber,
      channel: input.channel,
      treasuryAccountId: treasury.id,
      treasuryAccountCode: treasury.chart_code,
      receivableAccountCode: receivable.code,
      amount: input.amount,
      accountingEventCode: input.accountingEventCode,
    }), now),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ACCOUNTING_PERIOD_CLOSED")) throw new Error("Periode akuntansi tanggal pencairan sudah CLOSED/LOCKED.");
    if (message.includes("request_idempotency") || message.includes("UNIQUE constraint")) {
      const retry = await db.prepare(`SELECT request_hash,resource_id FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1`)
        .bind(input.organizationId, idempotencyKey).first<{ request_hash: string; resource_id: string | null }>();
      if (retry?.resource_id && retry.request_hash === requestHash) return retry.resource_id;
      throw new Error("Pencairan duplikat dicegah oleh D1.");
    }
    throw error;
  }

  return journalId;
}
