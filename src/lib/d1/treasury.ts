import { accountingPeriod, getAccountingIntegrity } from "./accounting";
import { ensureAccountingFoundation } from "./accounting-config";
import { getD1, type D1PreparedLike } from "./context";

export type TreasuryAccountRow = {
  id: string;
  code: string;
  name: string;
  account_type: "CASH" | "BANK";
  chart_account_id: string;
  chart_account_code: string;
  chart_account_name: string;
  bank_name: string | null;
  account_reference: string | null;
  status: "ACTIVE" | "INACTIVE";
  is_default: number;
  balance_amount: number;
};

export type TreasuryTransactionRow = {
  id: string;
  transaction_number: string;
  treasury_account_id: string;
  treasury_code: string;
  treasury_name: string;
  direction: "IN" | "OUT";
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
  amount: number;
  description: string;
  reference_number: string | null;
  transfer_group_id: string | null;
  status: "POSTED" | "REVERSED";
  posted_by: string;
  posted_at: string;
  journal_entry_id: string;
  journal_number: string;
};

export type AccountingPeriodRow = {
  id: string;
  period_code: string;
  period_start: string;
  period_end: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
  created_by: string;
  closed_by: string | null;
  closed_at: string | null;
  close_note: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_note: string | null;
  locked_by: string | null;
  locked_at: string | null;
  lock_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ReconciliationRow = {
  id: string;
  reconciliation_number: string;
  treasury_account_id: string;
  treasury_code: string;
  treasury_name: string;
  period_start: string;
  period_end: string;
  statement_closing_balance: number;
  system_closing_balance: number;
  difference_amount: number;
  status: "DRAFT" | "RECONCILED" | "CANCELLED";
  item_count: number;
  unmatched_count: number;
  created_by: string;
  reconciled_by: string | null;
  reconciled_at: string | null;
  notes: string | null;
  created_at: string;
};

export type ReconciliationItemRow = {
  id: string;
  journal_line_id: string;
  matched: number;
  match_note: string | null;
  matched_by: string | null;
  matched_at: string | null;
  entry_number: string;
  source_type: string;
  source_id: string;
  description: string;
  posted_at: string | null;
  debit_amount: number;
  credit_amount: number;
  memo: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function documentNumber(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

function normalizeText(value: string, min: number, max: number, label: string) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`${label} harus ${min}–${max} karakter.`);
  return text;
}

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Bulan periode tidak valid.");
  const [year, numericMonth] = month.split("-").map(Number);
  if (numericMonth < 1 || numericMonth > 12 || year < 2000 || year > 2100) throw new Error("Bulan periode tidak valid.");
  const lastDay = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

async function accountBalanceAsOf(organizationId: string, accountCode: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("Tanggal saldo rekonsiliasi tidak valid.");
  const endMs = Date.parse(`${endDate}T00:00:00+07:00`);
  if (!Number.isFinite(endMs)) throw new Error("Tanggal saldo rekonsiliasi tidak valid.");
  const toExclusiveIso = new Date(endMs + 86_400_000).toISOString();
  const db = getD1();
  const row = await db.prepare(`
    SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount),0) AS balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.organization_id=? AND je.status='POSTED'
      AND jl.account_code=?
      AND COALESCE(je.posted_at,je.created_at) < ?
  `).bind(organizationId, accountCode, toExclusiveIso).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

export async function ensureTreasuryFoundation(organizationId: string) {
  await ensureAccountingFoundation(organizationId);
  const db = getD1();
  const accounts = await db.prepare(`
    SELECT id, code FROM chart_of_accounts
    WHERE organization_id=? AND code IN ('1-1000','1-1100') AND status='ACTIVE'
  `).bind(organizationId).all<{ id: string; code: string }>();
  const byCode = new Map(accounts.results.map((row) => [row.code, row.id]));
  const cashId = byCode.get("1-1000");
  const bankId = byCode.get("1-1100");
  if (!cashId || !bankId) throw new Error("Foundation akun Kas/Bank belum tersedia.");
  const now = nowIso();
  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO treasury_accounts (
        id, organization_id, code, name, account_type, chart_account_id,
        bank_name, account_reference, status, is_default,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, 'CASH_MAIN', 'Kas Utama', 'CASH', ?, NULL, NULL, 'ACTIVE', 1,
                'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
    `).bind(`treasury:${organizationId}:CASH_MAIN`, organizationId, cashId, now, now),
    db.prepare(`
      INSERT OR IGNORE INTO treasury_accounts (
        id, organization_id, code, name, account_type, chart_account_id,
        bank_name, account_reference, status, is_default,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, 'BANK_MAIN', 'Bank Utama', 'BANK', ?, NULL, NULL, 'ACTIVE', 1,
                'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
    `).bind(`treasury:${organizationId}:BANK_MAIN`, organizationId, bankId, now, now),
  ]);
}

export async function listTreasuryAccounts(organizationId: string) {
  await ensureTreasuryFoundation(organizationId);
  const db = getD1();
  const result = await db.prepare(`
    SELECT ta.id, ta.code, ta.name, ta.account_type, ta.chart_account_id,
           ca.code AS chart_account_code, ca.name AS chart_account_name,
           ta.bank_name, ta.account_reference, ta.status, ta.is_default,
           COALESCE((
             SELECT SUM(jl.debit_amount - jl.credit_amount)
             FROM journal_lines jl
             JOIN journal_entries je ON je.id=jl.journal_entry_id
             WHERE je.organization_id=ta.organization_id
               AND je.status='POSTED'
               AND jl.account_code=ca.code
           ),0) AS balance_amount
    FROM treasury_accounts ta
    JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.organization_id=?
    ORDER BY CASE ta.account_type WHEN 'CASH' THEN 0 ELSE 1 END, ta.code
  `).bind(organizationId).all<TreasuryAccountRow>();
  return result.results.map((row) => ({
    ...row,
    is_default: Number(row.is_default),
    balance_amount: Number(row.balance_amount),
  }));
}

export async function createTreasuryAccount(input: {
  organizationId: string;
  actorUserId: string;
  code: string;
  name: string;
  accountType: "CASH" | "BANK";
  chartAccountId: string;
  bankName?: string | null;
  accountReference?: string | null;
}) {
  await ensureTreasuryFoundation(input.organizationId);
  const db = getD1();
  const code = input.code.trim().toUpperCase();
  const name = normalizeText(input.name, 3, 100, "Nama kas/bank");
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new Error("Kode kas/bank hanya boleh A-Z, angka, _ atau - (3–24 karakter).");
  if (!['CASH','BANK'].includes(input.accountType)) throw new Error("Tipe kas/bank tidak valid.");
  const chart = await db.prepare(`
    SELECT id, code, account_type, status FROM chart_of_accounts
    WHERE id=? AND organization_id=? LIMIT 1
  `).bind(input.chartAccountId, input.organizationId).first<{ id: string; code: string; account_type: string; status: string }>();
  if (!chart || chart.status !== 'ACTIVE' || chart.account_type !== 'ASSET') throw new Error("Treasury account harus terhubung ke akun ASSET aktif.");
  const mapped = await db.prepare(`
    SELECT id, code FROM treasury_accounts
    WHERE organization_id=? AND chart_account_id=? LIMIT 1
  `).bind(input.organizationId, chart.id).first<{ id: string; code: string }>();
  if (mapped) throw new Error(`Akun COA ${chart.code} sudah dipakai treasury ${mapped.code}. Gunakan akun ASSET terpisah agar saldo tidak terhitung ganda.`);
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.batch([
    db.prepare(`
      INSERT INTO treasury_accounts (
        id, organization_id, code, name, account_type, chart_account_id,
        bank_name, account_reference, status, is_default, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?, ?)
    `).bind(
      id, input.organizationId, code, name, input.accountType, chart.id,
      input.accountType === 'BANK' ? input.bankName?.trim() || null : null,
      input.accountType === 'BANK' ? input.accountReference?.trim() || null : null,
      input.actorUserId, input.actorUserId, now, now,
    ),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'TREASURY_ACCOUNT_CREATED', 'TREASURY_ACCOUNT', ?, ?, ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, id, JSON.stringify({ code, name, type: input.accountType, chartAccountCode: chart.code }), now),
  ]);
  return id;
}

export async function listTreasuryTransactions(organizationId: string, limit = 120) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(300, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT tt.id, tt.transaction_number, tt.treasury_account_id, ta.code AS treasury_code,
           ta.name AS treasury_name, tt.direction, tt.transaction_type, tt.amount,
           tt.description, tt.reference_number, tt.transfer_group_id, tt.status,
           tt.posted_by, tt.posted_at, tt.journal_entry_id, je.entry_number AS journal_number
    FROM treasury_transactions tt
    JOIN treasury_accounts ta ON ta.id=tt.treasury_account_id
    JOIN journal_entries je ON je.id=tt.journal_entry_id
    WHERE tt.organization_id=?
    ORDER BY tt.posted_at DESC, tt.created_at DESC
    LIMIT ${safeLimit}
  `).bind(organizationId).all<TreasuryTransactionRow>();
  return result.results.map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function postTreasuryEntry(input: {
  organizationId: string;
  actorUserId: string;
  treasuryAccountId: string;
  type: "INCOME" | "EXPENSE";
  counterpartAccountId: string;
  amount: number;
  description: string;
  referenceNumber?: string | null;
  idempotencyKey: string;
}) {
  await ensureTreasuryFoundation(input.organizationId);
  const db = getD1();
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Nominal transaksi tidak valid.");
  const description = normalizeText(input.description, 5, 180, "Keterangan");
  const idempotencyKey = normalizeText(input.idempotencyKey, 12, 120, "Idempotency key");
  const existing = await db.prepare(`
    SELECT resource_id FROM request_idempotency
    WHERE organization_id=? AND idempotency_key=? LIMIT 1
  `).bind(input.organizationId, idempotencyKey).first<{ resource_id: string | null }>();
  if (existing?.resource_id) return existing.resource_id;

  const treasury = await db.prepare(`
    SELECT ta.id, ta.status, ca.id AS chart_account_id, ca.code AS chart_code, ca.status AS chart_status
    FROM treasury_accounts ta JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.id=? AND ta.organization_id=? LIMIT 1
  `).bind(input.treasuryAccountId, input.organizationId).first<{ id: string; status: string; chart_account_id: string; chart_code: string; chart_status: string }>();
  if (!treasury || treasury.status !== 'ACTIVE' || treasury.chart_status !== 'ACTIVE') throw new Error("Kas/Bank transaksi tidak aktif.");

  const counterpart = await db.prepare(`
    SELECT id, code, name, account_type, status FROM chart_of_accounts
    WHERE id=? AND organization_id=? LIMIT 1
  `).bind(input.counterpartAccountId, input.organizationId).first<{ id: string; code: string; name: string; account_type: string; status: string }>();
  const expectedType = input.type === 'EXPENSE' ? 'EXPENSE' : 'REVENUE';
  if (!counterpart || counterpart.status !== 'ACTIVE' || counterpart.account_type !== expectedType) {
    throw new Error(input.type === 'EXPENSE' ? "Expense harus memakai akun EXPENSE aktif." : "Income harus memakai akun REVENUE aktif.");
  }

  const transactionId = crypto.randomUUID();
  const journalId = crypto.randomUUID();
  const now = nowIso();
  const transactionNumber = documentNumber(input.type === 'EXPENSE' ? 'EXP' : 'INC');
  const direction = input.type === 'EXPENSE' ? 'OUT' : 'IN';
  const debitCode = input.type === 'EXPENSE' ? counterpart.code : treasury.chart_code;
  const creditCode = input.type === 'EXPENSE' ? treasury.chart_code : counterpart.code;
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO request_idempotency
        (organization_id, idempotency_key, operation, request_hash, resource_id, status, created_at, expires_at)
      VALUES (?, ?, 'TREASURY_ENTRY', ?, ?, 'COMPLETED', ?, NULL)
    `).bind(input.organizationId, idempotencyKey, JSON.stringify({ treasury: treasury.id, type: input.type, counterpart: counterpart.id, amount: input.amount }), transactionId, now),
    db.prepare(`
      INSERT INTO journal_entries
        (id, organization_id, entry_number, source_type, source_id, description, status, posted_by, posted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?)
    `).bind(journalId, input.organizationId, `JRN-${transactionNumber}`, `TREASURY_${input.type}`, transactionId, description, input.actorUserId, now, now),
    db.prepare(`INSERT INTO journal_lines
      (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)`)
      .bind(crypto.randomUUID(), journalId, debitCode, input.amount, description, now),
    db.prepare(`INSERT INTO journal_lines
      (id, journal_entry_id, account_code, debit_amount, credit_amount, memo, created_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)`)
      .bind(crypto.randomUUID(), journalId, creditCode, input.amount, description, now),
    db.prepare(`
      INSERT INTO treasury_transactions (
        id, organization_id, transaction_number, treasury_account_id, direction, transaction_type,
        amount, counterpart_account_id, description, reference_number, transfer_group_id,
        journal_entry_id, status, posted_by, posted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'POSTED', ?, ?, ?)
    `).bind(
      transactionId, input.organizationId, transactionNumber, treasury.id, direction, input.type,
      input.amount, counterpart.id, description, input.referenceNumber?.trim() || null,
      journalId, input.actorUserId, now, now,
    ),
    db.prepare(`INSERT INTO transaction_audit_events
      (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'TREASURY_ENTRY_POSTED', 'TREASURY_TRANSACTION', ?, ?, ?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, transactionId, JSON.stringify({ transactionNumber, type: input.type, amount: input.amount, treasuryAccount: treasury.chart_code, counterpart: counterpart.code }), now),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ACCOUNTING_PERIOD_CLOSED')) throw new Error("Periode akuntansi untuk tanggal transaksi sudah CLOSED/LOCKED.");
    if (message.includes('request_idempotency') || message.includes('UNIQUE constraint')) throw new Error("Transaksi duplikat dicegah.");
    throw error;
  }
  return transactionId;
}

export async function transferTreasury(input: {
  organizationId: string;
  actorUserId: string;
  fromTreasuryAccountId: string;
  toTreasuryAccountId: string;
  amount: number;
  description: string;
  referenceNumber?: string | null;
  idempotencyKey: string;
}) {
  await ensureTreasuryFoundation(input.organizationId);
  if (input.fromTreasuryAccountId === input.toTreasuryAccountId) throw new Error("Rekening asal dan tujuan harus berbeda.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Nominal transfer tidak valid.");
  const description = normalizeText(input.description, 5, 180, "Keterangan transfer");
  const key = normalizeText(input.idempotencyKey, 12, 120, "Idempotency key");
  const db = getD1();
  const existing = await db.prepare("SELECT resource_id FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1")
    .bind(input.organizationId, key).first<{ resource_id: string | null }>();
  if (existing?.resource_id) return existing.resource_id;

  const rows = await db.prepare(`
    SELECT ta.id, ta.status, ca.code AS chart_code, ca.status AS chart_status
    FROM treasury_accounts ta JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.organization_id=? AND ta.id IN (?,?)
  `).bind(input.organizationId, input.fromTreasuryAccountId, input.toTreasuryAccountId)
    .all<{ id: string; status: string; chart_code: string; chart_status: string }>();
  const byId = new Map(rows.results.map((row) => [row.id, row]));
  const from = byId.get(input.fromTreasuryAccountId);
  const to = byId.get(input.toTreasuryAccountId);
  if (!from || !to || from.status !== 'ACTIVE' || to.status !== 'ACTIVE' || from.chart_status !== 'ACTIVE' || to.chart_status !== 'ACTIVE') {
    throw new Error("Rekening asal/tujuan tidak aktif.");
  }

  const transferGroupId = crypto.randomUUID();
  const outId = crypto.randomUUID();
  const inId = crypto.randomUUID();
  const journalId = crypto.randomUUID();
  const number = documentNumber('TRF');
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`INSERT INTO request_idempotency
      (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,'TREASURY_TRANSFER',?,?,'COMPLETED',?,NULL)`)
      .bind(input.organizationId, key, JSON.stringify({ from: from.id, to: to.id, amount: input.amount }), transferGroupId, now),
    db.prepare(`INSERT INTO journal_entries
      (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'TREASURY_TRANSFER',?,?,'POSTED',?,?,?)`)
      .bind(journalId, input.organizationId, `JRN-${number}`, transferGroupId, description, input.actorUserId, now, now),
    db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,0,?,?)`)
      .bind(crypto.randomUUID(), journalId, to.chart_code, input.amount, `Transfer masuk · ${description}`, now),
    db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,0,?,?,?)`)
      .bind(crypto.randomUUID(), journalId, from.chart_code, input.amount, `Transfer keluar · ${description}`, now),
    db.prepare(`INSERT INTO treasury_transactions
      (id,organization_id,transaction_number,treasury_account_id,direction,transaction_type,amount,counterpart_account_id,description,reference_number,transfer_group_id,journal_entry_id,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,?,'OUT','TRANSFER_OUT',?,NULL,?,?,?,?,'POSTED',?,?,?)`)
      .bind(outId, input.organizationId, `${number}-OUT`, from.id, input.amount, description, input.referenceNumber?.trim() || null, transferGroupId, journalId, input.actorUserId, now, now),
    db.prepare(`INSERT INTO treasury_transactions
      (id,organization_id,transaction_number,treasury_account_id,direction,transaction_type,amount,counterpart_account_id,description,reference_number,transfer_group_id,journal_entry_id,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,?,'IN','TRANSFER_IN',?,NULL,?,?,?,?,'POSTED',?,?,?)`)
      .bind(inId, input.organizationId, `${number}-IN`, to.id, input.amount, description, input.referenceNumber?.trim() || null, transferGroupId, journalId, input.actorUserId, now, now),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'TREASURY_TRANSFER_POSTED','TREASURY_TRANSFER',?,?,?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, transferGroupId, JSON.stringify({ number, from: from.chart_code, to: to.chart_code, amount: input.amount }), now),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ACCOUNTING_PERIOD_CLOSED')) throw new Error("Periode akuntansi untuk tanggal transfer sudah CLOSED/LOCKED.");
    if (message.includes('request_idempotency') || message.includes('UNIQUE constraint')) throw new Error("Transfer duplikat dicegah.");
    throw error;
  }
  return transferGroupId;
}

export async function createAccountingPeriod(input: {
  organizationId: string;
  actorUserId: string;
  month: string;
}) {
  const db = getD1();
  const bounds = monthBounds(input.month);
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await db.batch([
      db.prepare(`INSERT INTO accounting_periods
        (id,organization_id,period_code,period_start,period_end,status,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,'OPEN',?,?,?)`)
        .bind(id, input.organizationId, input.month, bounds.start, bounds.end, input.actorUserId, now, now),
      db.prepare(`INSERT INTO transaction_audit_events
        (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
        VALUES (?,?,?,'ACCOUNTING_PERIOD_CREATED','ACCOUNTING_PERIOD',?,?,?)`)
        .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, id, JSON.stringify({ periodCode: input.month, ...bounds }), now),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ACCOUNTING_PERIOD_OVERLAP')) throw new Error("Periode bertumpang tindih dengan periode yang sudah ada.");
    if (message.includes('UNIQUE constraint')) throw new Error("Periode tersebut sudah tersedia.");
    throw error;
  }
  return id;
}

export async function listAccountingPeriods(organizationId: string, limit = 36) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(120, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT id,period_code,period_start,period_end,status,created_by,closed_by,closed_at,close_note,
           reopened_by,reopened_at,reopen_note,locked_by,locked_at,lock_note,created_at,updated_at
    FROM accounting_periods WHERE organization_id=?
    ORDER BY period_start DESC LIMIT ${safeLimit}
  `).bind(organizationId).all<AccountingPeriodRow>();
  return result.results;
}

export async function transitionAccountingPeriod(input: {
  organizationId: string;
  actorUserId: string;
  periodId: string;
  action: "CLOSE" | "REOPEN" | "LOCK";
  note: string;
}) {
  const note = normalizeText(input.note, 8, 240, "Catatan keputusan");
  const db = getD1();
  const period = await db.prepare(`
    SELECT id,period_code,period_start,period_end,status,closed_by
    FROM accounting_periods WHERE id=? AND organization_id=? LIMIT 1
  `).bind(input.periodId, input.organizationId).first<{ id: string; period_code: string; period_start: string; period_end: string; status: string; closed_by: string | null }>();
  if (!period) throw new Error("Periode akuntansi tidak ditemukan.");
  const now = nowIso();

  if (input.action === 'CLOSE') {
    if (period.status !== 'OPEN') throw new Error("Hanya periode OPEN yang dapat ditutup.");
    const integrity = await getAccountingIntegrity(input.organizationId, accountingPeriod(period.period_start, period.period_end));
    if (!integrity.passed) throw new Error(`Periode memiliki ${integrity.exceptions.length} journal exception dan belum boleh ditutup.`);
    const draftRecon = await db.prepare(`
      SELECT COUNT(*) AS count FROM bank_reconciliation_sessions
      WHERE organization_id=? AND status='DRAFT'
        AND period_start <= ? AND period_end >= ?
    `).bind(input.organizationId, period.period_end, period.period_start).first<{ count: number }>();
    if (Number(draftRecon?.count ?? 0) > 0) throw new Error("Masih ada rekonsiliasi bank DRAFT yang bertumpang tindih dengan periode ini.");
    await db.batch([
      db.prepare(`UPDATE accounting_periods SET status='CLOSED',closed_by=?,closed_at=?,close_note=?,updated_at=? WHERE id=? AND status='OPEN'`)
        .bind(input.actorUserId, now, note, now, period.id),
      db.prepare(`INSERT INTO transaction_audit_events
        (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
        VALUES (?,?,?,'ACCOUNTING_PERIOD_CLOSED','ACCOUNTING_PERIOD',?,?,?)`)
        .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, period.id, JSON.stringify({ periodCode: period.period_code, note }), now),
    ]);
    return;
  }

  if (input.action === 'REOPEN') {
    if (period.status !== 'CLOSED') throw new Error("Hanya periode CLOSED yang dapat dibuka kembali.");
    await db.batch([
      db.prepare(`UPDATE accounting_periods SET status='OPEN',reopened_by=?,reopened_at=?,reopen_note=?,updated_at=? WHERE id=? AND status='CLOSED'`)
        .bind(input.actorUserId, now, note, now, period.id),
      db.prepare(`INSERT INTO transaction_audit_events
        (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
        VALUES (?,?,?,'ACCOUNTING_PERIOD_REOPENED','ACCOUNTING_PERIOD',?,?,?)`)
        .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, period.id, JSON.stringify({ periodCode: period.period_code, note }), now),
    ]);
    return;
  }

  if (period.status !== 'CLOSED') throw new Error("Periode harus CLOSED sebelum dapat di-LOCK.");
  if (period.closed_by === input.actorUserId) throw new Error("Maker-checker: user yang menutup periode tidak boleh melakukan LOCK final.");
  const integrity = await getAccountingIntegrity(input.organizationId, accountingPeriod(period.period_start, period.period_end));
  if (!integrity.passed) throw new Error("Journal integrity tidak PASS.");
  await db.batch([
    db.prepare(`UPDATE accounting_periods SET status='LOCKED',locked_by=?,locked_at=?,lock_note=?,updated_at=? WHERE id=? AND status='CLOSED'`)
      .bind(input.actorUserId, now, note, now, period.id),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'ACCOUNTING_PERIOD_LOCKED','ACCOUNTING_PERIOD',?,?,?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, period.id, JSON.stringify({ periodCode: period.period_code, note }), now),
  ]);
}

export async function createBankReconciliation(input: {
  organizationId: string;
  actorUserId: string;
  treasuryAccountId: string;
  periodStart: string;
  periodEnd: string;
  statementClosingBalance: number;
  notes?: string | null;
}) {
  const period = accountingPeriod(input.periodStart, input.periodEnd);
  if (!Number.isSafeInteger(input.statementClosingBalance)) throw new Error("Saldo akhir rekening koran tidak valid.");
  await ensureTreasuryFoundation(input.organizationId);
  const db = getD1();
  const account = await db.prepare(`
    SELECT ta.id,ta.account_type,ta.status,ca.code AS chart_code
    FROM treasury_accounts ta JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.id=? AND ta.organization_id=? LIMIT 1
  `).bind(input.treasuryAccountId, input.organizationId).first<{ id: string; account_type: string; status: string; chart_code: string }>();
  if (!account || account.account_type !== 'BANK' || account.status !== 'ACTIVE') throw new Error("Rekonsiliasi hanya untuk rekening BANK aktif.");
  const existing = await db.prepare(`
    SELECT id FROM bank_reconciliation_sessions
    WHERE organization_id=? AND treasury_account_id=? AND period_start=? AND period_end=? AND status<>'CANCELLED' LIMIT 1
  `).bind(input.organizationId, account.id, period.from, period.to).first<{ id: string }>();
  if (existing) throw new Error("Rekonsiliasi aktif untuk rekening dan periode tersebut sudah ada.");

  const systemBalance = await accountBalanceAsOf(input.organizationId, account.chart_code, period.to);
  const difference = input.statementClosingBalance - systemBalance;
  const journalLines = await db.prepare(`
    SELECT jl.id
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.organization_id=? AND je.status='POSTED' AND jl.account_code=?
      AND COALESCE(je.posted_at,je.created_at) >= ?
      AND COALESCE(je.posted_at,je.created_at) < ?
    ORDER BY COALESCE(je.posted_at,je.created_at), jl.created_at
  `).bind(input.organizationId, account.chart_code, period.fromIso, period.toExclusiveIso).all<{ id: string }>();

  const sessionId = crypto.randomUUID();
  const number = documentNumber('REC');
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`INSERT INTO bank_reconciliation_sessions
      (id,organization_id,treasury_account_id,reconciliation_number,period_start,period_end,
       statement_closing_balance,system_closing_balance,difference_amount,status,notes,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?)`)
      .bind(sessionId, input.organizationId, account.id, number, period.from, period.to, input.statementClosingBalance, systemBalance, difference, input.notes?.trim() || null, input.actorUserId, now, now),
  ];
  for (const line of journalLines.results) {
    statements.push(db.prepare(`INSERT INTO bank_reconciliation_items
      (id,session_id,journal_line_id,matched,created_at,updated_at)
      VALUES (?,?,?,0,?,?)`)
      .bind(crypto.randomUUID(), sessionId, line.id, now, now));
  }
  statements.push(db.prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'BANK_RECONCILIATION_CREATED','BANK_RECONCILIATION',?,?,?)`)
    .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, sessionId, JSON.stringify({ number, periodStart: period.from, periodEnd: period.to, statementClosingBalance: input.statementClosingBalance, systemBalance, difference, items: journalLines.results.length }), now));
  await db.batch(statements);
  return sessionId;
}

export async function listBankReconciliations(organizationId: string, limit = 60) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(120, Math.trunc(limit)));
  const result = await db.prepare(`
    SELECT brs.id,brs.reconciliation_number,brs.treasury_account_id,ta.code AS treasury_code,
           ta.name AS treasury_name,brs.period_start,brs.period_end,brs.statement_closing_balance,
           brs.system_closing_balance,brs.difference_amount,brs.status,brs.created_by,brs.reconciled_by,
           brs.reconciled_at,brs.notes,brs.created_at,
           COUNT(bri.id) AS item_count,
           COALESCE(SUM(CASE WHEN bri.matched=0 THEN 1 ELSE 0 END),0) AS unmatched_count
    FROM bank_reconciliation_sessions brs
    JOIN treasury_accounts ta ON ta.id=brs.treasury_account_id
    LEFT JOIN bank_reconciliation_items bri ON bri.session_id=brs.id
    WHERE brs.organization_id=?
    GROUP BY brs.id
    ORDER BY brs.period_end DESC,brs.created_at DESC LIMIT ${safeLimit}
  `).bind(organizationId).all<ReconciliationRow>();
  return result.results.map((row) => ({
    ...row,
    statement_closing_balance: Number(row.statement_closing_balance),
    system_closing_balance: Number(row.system_closing_balance),
    difference_amount: Number(row.difference_amount),
    item_count: Number(row.item_count),
    unmatched_count: Number(row.unmatched_count),
  }));
}

export async function getBankReconciliationDetail(organizationId: string, sessionId: string) {
  const db = getD1();
  const session = await db.prepare(`
    SELECT brs.id,brs.reconciliation_number,brs.treasury_account_id,ta.code AS treasury_code,
           ta.name AS treasury_name,brs.period_start,brs.period_end,brs.statement_closing_balance,
           brs.system_closing_balance,brs.difference_amount,brs.status,brs.created_by,brs.reconciled_by,
           brs.reconciled_at,brs.notes,brs.created_at,
           COUNT(bri.id) AS item_count,
           COALESCE(SUM(CASE WHEN bri.matched=0 THEN 1 ELSE 0 END),0) AS unmatched_count
    FROM bank_reconciliation_sessions brs
    JOIN treasury_accounts ta ON ta.id=brs.treasury_account_id
    LEFT JOIN bank_reconciliation_items bri ON bri.session_id=brs.id
    WHERE brs.id=? AND brs.organization_id=? GROUP BY brs.id LIMIT 1
  `).bind(sessionId, organizationId).first<ReconciliationRow>();
  if (!session) return null;
  const items = await db.prepare(`
    SELECT bri.id,bri.journal_line_id,bri.matched,bri.match_note,bri.matched_by,bri.matched_at,
           je.entry_number,je.source_type,je.source_id,je.description,je.posted_at,
           jl.debit_amount,jl.credit_amount,jl.memo
    FROM bank_reconciliation_items bri
    JOIN journal_lines jl ON jl.id=bri.journal_line_id
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE bri.session_id=?
    ORDER BY COALESCE(je.posted_at,je.created_at),jl.created_at
  `).bind(sessionId).all<ReconciliationItemRow>();
  return {
    session: {
      ...session,
      statement_closing_balance: Number(session.statement_closing_balance),
      system_closing_balance: Number(session.system_closing_balance),
      difference_amount: Number(session.difference_amount),
      item_count: Number(session.item_count),
      unmatched_count: Number(session.unmatched_count),
    },
    items: items.results.map((row) => ({ ...row, matched: Number(row.matched), debit_amount: Number(row.debit_amount), credit_amount: Number(row.credit_amount) })),
  };
}

export async function setReconciliationItemMatch(input: {
  organizationId: string;
  actorUserId: string;
  sessionId: string;
  itemId: string;
  matched: boolean;
  note?: string | null;
}) {
  const db = getD1();
  const row = await db.prepare(`
    SELECT bri.id,brs.status FROM bank_reconciliation_items bri
    JOIN bank_reconciliation_sessions brs ON brs.id=bri.session_id
    WHERE bri.id=? AND bri.session_id=? AND brs.organization_id=? LIMIT 1
  `).bind(input.itemId, input.sessionId, input.organizationId).first<{ id: string; status: string }>();
  if (!row || row.status !== 'DRAFT') throw new Error("Item hanya dapat diubah pada rekonsiliasi DRAFT.");
  const now = nowIso();
  await db.prepare(`UPDATE bank_reconciliation_items
    SET matched=?,match_note=?,matched_by=?,matched_at=?,updated_at=? WHERE id=?`)
    .bind(input.matched ? 1 : 0, input.note?.trim() || null, input.matched ? input.actorUserId : null, input.matched ? now : null, now, row.id).run();
}

export async function completeBankReconciliation(input: {
  organizationId: string;
  actorUserId: string;
  sessionId: string;
}) {
  const db = getD1();
  const session = await db.prepare(`
    SELECT brs.id,brs.status,brs.period_end,brs.statement_closing_balance,ca.code AS chart_code
    FROM bank_reconciliation_sessions brs
    JOIN treasury_accounts ta ON ta.id=brs.treasury_account_id
    JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE brs.id=? AND brs.organization_id=? LIMIT 1
  `).bind(input.sessionId, input.organizationId).first<{ id: string; status: string; period_end: string; statement_closing_balance: number; chart_code: string }>();
  if (!session || session.status !== 'DRAFT') throw new Error("Rekonsiliasi tidak dalam status DRAFT.");
  const unmatched = await db.prepare("SELECT COUNT(*) AS count FROM bank_reconciliation_items WHERE session_id=? AND matched=0")
    .bind(session.id).first<{ count: number }>();
  if (Number(unmatched?.count ?? 0) > 0) throw new Error(`Masih ada ${Number(unmatched?.count ?? 0)} item yang belum matched.`);
  const systemBalance = await accountBalanceAsOf(input.organizationId, session.chart_code, session.period_end);
  const difference = Number(session.statement_closing_balance) - systemBalance;
  if (difference !== 0) throw new Error(`Saldo rekening koran belum sama dengan ledger. Selisih Rp${difference}.`);
  const now = nowIso();
  await db.batch([
    db.prepare(`UPDATE bank_reconciliation_sessions
      SET status='RECONCILED',system_closing_balance=?,difference_amount=0,reconciled_by=?,reconciled_at=?,updated_at=?
      WHERE id=? AND status='DRAFT'`)
      .bind(systemBalance, input.actorUserId, now, now, session.id),
    db.prepare(`INSERT INTO transaction_audit_events
      (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'BANK_RECONCILIATION_COMPLETED','BANK_RECONCILIATION',?,?,?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, session.id, JSON.stringify({ systemBalance, difference: 0 }), now),
  ]);
}
