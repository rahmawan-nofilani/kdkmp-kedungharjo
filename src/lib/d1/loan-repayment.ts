import { getD1, type D1PreparedLike } from "./context";
import { ensureTreasuryFoundation } from "./treasury";

export type LoanRepaymentChannel = "CASH" | "BANK_TRANSFER" | "QRIS";

function nowIso() {
  return new Date().toISOString();
}

function documentNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `LR-${stamp}-${random}`;
}

function safeText(value: string, min: number, max: number, label: string) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`${label} harus ${min}–${max} karakter.`);
  return text;
}

async function ensureLoanRepaymentAccounts(organizationId: string) {
  const db = getD1();
  const now = nowIso();
  const accounts = [
    { code: "1-1200", name: "Piutang Pinjaman Anggota", type: "ASSET", normal: "DEBIT" },
    { code: "4-1100", name: "Pendapatan Bunga Pinjaman", type: "REVENUE", normal: "CREDIT" },
    { code: "4-1200", name: "Pendapatan Denda Pinjaman", type: "REVENUE", normal: "CREDIT" },
  ] as const;

  for (const account of accounts) {
    await db.prepare(`
      INSERT OR IGNORE INTO chart_of_accounts (
        id, organization_id, code, name, account_type, normal_balance,
        parent_account_id, status, is_system, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', 1,
                'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
    `).bind(`acct:${organizationId}:${account.code}`, organizationId, account.code, account.name, account.type, account.normal, now, now).run();
  }

  const result = await db.prepare(`
    SELECT code,status,account_type FROM chart_of_accounts
    WHERE organization_id=? AND code IN ('1-1200','4-1100','4-1200')
  `).bind(organizationId).all<{ code: string; status: string; account_type: string }>();
  const byCode = new Map(result.results.map((row) => [row.code, row]));
  const receivable = byCode.get("1-1200");
  const interest = byCode.get("4-1100");
  const penalty = byCode.get("4-1200");
  if (!receivable || receivable.status !== "ACTIVE" || receivable.account_type !== "ASSET") {
    throw new Error("Akun Piutang Pinjaman 1-1200 belum siap.");
  }
  if (!interest || interest.status !== "ACTIVE" || interest.account_type !== "REVENUE") {
    throw new Error("Akun Pendapatan Bunga 4-1100 belum siap.");
  }
  if (!penalty || penalty.status !== "ACTIVE" || penalty.account_type !== "REVENUE") {
    throw new Error("Akun Pendapatan Denda 4-1200 belum siap.");
  }
  return { receivable, interest, penalty };
}

export async function postLoanRepayment(input: {
  organizationId: string;
  actorUserId: string;
  repaymentId: string;
  treasuryAccountId: string;
  channel: LoanRepaymentChannel;
  totalAmount: number;
  principalAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  principalAccountingEventCode: string;
  interestAccountingEventCode: string;
  penaltyAccountingEventCode: string;
  referenceNumber: string;
  description: string;
}) {
  await ensureTreasuryFoundation(input.organizationId);
  const accounts = await ensureLoanRepaymentAccounts(input.organizationId);
  const db = getD1();

  for (const [label, value] of [
    ["Total pembayaran", input.totalAmount],
    ["Pokok", input.principalAmount],
    ["Bunga", input.interestAmount],
    ["Denda", input.penaltyAmount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} pembayaran tidak valid.`);
  }
  if (input.totalAmount <= 0 || input.totalAmount !== input.principalAmount + input.interestAmount + input.penaltyAmount) {
    throw new Error("Komponen pembayaran tidak seimbang.");
  }
  if (!["CASH", "BANK_TRANSFER", "QRIS"].includes(input.channel)) throw new Error("Kanal pembayaran tidak valid.");
  for (const eventCode of [input.principalAccountingEventCode, input.interestAccountingEventCode, input.penaltyAccountingEventCode]) {
    if (!/^[A-Z0-9_]{3,80}$/.test(eventCode)) throw new Error("Kode event accounting pembayaran tidak valid.");
  }

  const referenceNumber = safeText(input.referenceNumber, 3, 120, "Referensi pembayaran");
  const description = safeText(input.description, 5, 180, "Keterangan pembayaran");
  const idempotencyKey = `loan-repayment:${input.repaymentId}`;
  const requestHash = JSON.stringify({
    repaymentId: input.repaymentId,
    treasuryAccountId: input.treasuryAccountId,
    channel: input.channel,
    totalAmount: input.totalAmount,
    principalAmount: input.principalAmount,
    interestAmount: input.interestAmount,
    penaltyAmount: input.penaltyAmount,
    principalAccountingEventCode: input.principalAccountingEventCode,
    interestAccountingEventCode: input.interestAccountingEventCode,
    penaltyAccountingEventCode: input.penaltyAccountingEventCode,
    referenceNumber,
  });

  const existing = await db.prepare(`
    SELECT request_hash,resource_id FROM request_idempotency
    WHERE organization_id=? AND idempotency_key=? LIMIT 1
  `).bind(input.organizationId, idempotencyKey).first<{ request_hash: string; resource_id: string | null }>();
  if (existing?.resource_id) {
    if (existing.request_hash !== requestHash) throw new Error("Idempotency key angsuran sudah dipakai dengan payload berbeda.");
    return existing.resource_id;
  }

  const treasury = await db.prepare(`
    SELECT ta.id,ta.status,ta.account_type,ca.code AS chart_code,ca.status AS chart_status
    FROM treasury_accounts ta
    JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.id=? AND ta.organization_id=? LIMIT 1
  `).bind(input.treasuryAccountId, input.organizationId)
    .first<{ id: string; status: string; account_type: string; chart_code: string; chart_status: string }>();
  if (!treasury || treasury.status !== "ACTIVE" || treasury.chart_status !== "ACTIVE") throw new Error("Kas/Bank penerimaan tidak aktif.");
  const expectedType = input.channel === "CASH" ? "CASH" : "BANK";
  if (treasury.account_type !== expectedType) {
    throw new Error(input.channel === "CASH" ? "Pembayaran CASH harus memakai treasury CASH." : "BANK_TRANSFER/QRIS harus memakai treasury BANK.");
  }

  const journalId = crypto.randomUUID();
  const number = documentNumber();
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO request_idempotency
        (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,'LOAN_REPAYMENT',?,?,'COMPLETED',?,NULL)
    `).bind(input.organizationId, idempotencyKey, requestHash, journalId, now),
    db.prepare(`
      INSERT INTO journal_entries
        (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'LOAN_REPAYMENT',?,?,'POSTED',?,?,?)
    `).bind(journalId, input.organizationId, `JRN-${number}`, input.repaymentId, description, input.actorUserId, now, now),
    db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,0,?,?)
    `).bind(crypto.randomUUID(), journalId, treasury.chart_code, input.totalAmount, `${referenceNumber} · ${description}`, now),
  ];

  if (input.principalAmount > 0) {
    statements.push(db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,0,?,?,?)
    `).bind(crypto.randomUUID(), journalId, accounts.receivable.code, input.principalAmount, `${input.principalAccountingEventCode} · ${description}`, now));
  }
  if (input.interestAmount > 0) {
    statements.push(db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,0,?,?,?)
    `).bind(crypto.randomUUID(), journalId, accounts.interest.code, input.interestAmount, `${input.interestAccountingEventCode} · ${description}`, now));
  }
  if (input.penaltyAmount > 0) {
    statements.push(db.prepare(`
      INSERT INTO journal_lines
        (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,0,?,?,?)
    `).bind(crypto.randomUUID(), journalId, accounts.penalty.code, input.penaltyAmount, `${input.penaltyAccountingEventCode} · ${description}`, now));
  }

  statements.push(db.prepare(`
    INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'LOAN_REPAYMENT_POSTED','LOAN_REPAYMENT',?,?,?)
  `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, input.repaymentId, JSON.stringify({
    journalId,
    referenceNumber,
    channel: input.channel,
    treasuryAccountId: treasury.id,
    treasuryAccountCode: treasury.chart_code,
    totalAmount: input.totalAmount,
    principalAmount: input.principalAmount,
    interestAmount: input.interestAmount,
    penaltyAmount: input.penaltyAmount,
    receivableAccountCode: accounts.receivable.code,
    interestRevenueAccountCode: accounts.interest.code,
    penaltyRevenueAccountCode: accounts.penalty.code,
  }), now));

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ACCOUNTING_PERIOD_CLOSED")) throw new Error("Periode akuntansi tanggal angsuran sudah CLOSED/LOCKED.");
    if (message.includes("request_idempotency") || message.includes("UNIQUE constraint")) {
      const retry = await db.prepare(`
        SELECT request_hash,resource_id FROM request_idempotency
        WHERE organization_id=? AND idempotency_key=? LIMIT 1
      `).bind(input.organizationId, idempotencyKey).first<{ request_hash: string; resource_id: string | null }>();
      if (retry?.resource_id && retry.request_hash === requestHash) return retry.resource_id;
      throw new Error("Pembayaran duplikat dicegah oleh D1.");
    }
    throw error;
  }

  return journalId;
}
