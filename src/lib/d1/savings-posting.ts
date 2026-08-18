import { ensureAccountingFoundation, getActiveAccountingMapping } from "./accounting-config";
import { getD1, type D1PreparedLike } from "./context";
import { getSavingsLedgerAccount } from "./savings-ledger";
import { ensureTreasuryFoundation } from "./treasury";

function nowIso() {
  return new Date().toISOString();
}

function documentNumber(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

function eventCode(value: unknown, fallback: string) {
  const code = String(value || fallback).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,59}$/.test(code)) {
    throw new Error("Kode mapping akuntansi produk tidak valid.");
  }
  return code;
}

async function treasuryForPosting(
  organizationId: string,
  treasuryAccountId: string,
  paymentMethod: "CASH" | "BANK_TRANSFER",
) {
  await ensureTreasuryFoundation(organizationId);
  const db = getD1();
  const row = await db
    .prepare(`SELECT ta.id,ta.name,ta.account_type,ta.status,ca.code AS chart_code,ca.account_type AS chart_type,ca.status AS chart_status
      FROM treasury_accounts ta JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
      WHERE ta.id=? AND ta.organization_id=? LIMIT 1`)
    .bind(treasuryAccountId, organizationId)
    .first<{
      id: string;
      name: string;
      account_type: string;
      status: string;
      chart_code: string;
      chart_type: string;
      chart_status: string;
    }>();

  if (!row || row.status !== "ACTIVE" || row.chart_status !== "ACTIVE" || row.chart_type !== "ASSET") {
    throw new Error("Kas/Bank tidak aktif.");
  }
  if (paymentMethod === "CASH" && row.account_type !== "CASH") {
    throw new Error("Setoran/penarikan tunai harus memakai akun Kas.");
  }
  if (paymentMethod === "BANK_TRANSFER" && row.account_type !== "BANK") {
    throw new Error("Transfer harus memakai akun Bank.");
  }
  return row;
}

async function savingsMapping(
  organizationId: string,
  eventCodeValue: string,
  kind: "DEPOSIT" | "WITHDRAWAL",
) {
  await ensureAccountingFoundation(organizationId);
  const code = eventCode(eventCodeValue, kind === "DEPOSIT" ? "SAVINGS_DEPOSIT" : "SAVINGS_WITHDRAWAL");
  const mapping = await getActiveAccountingMapping(organizationId, code);
  if (!mapping) throw new Error(`Mapping akuntansi ${code} belum APPROVED.`);

  const liabilityCode = kind === "DEPOSIT" ? mapping.credit_code : mapping.debit_code;
  const db = getD1();
  const account = await db
    .prepare(`SELECT code,account_type,status FROM chart_of_accounts WHERE organization_id=? AND code=? LIMIT 1`)
    .bind(organizationId, liabilityCode)
    .first<{ code: string; account_type: string; status: string }>();

  if (!account || account.status !== "ACTIVE" || account.account_type !== "LIABILITY") {
    throw new Error("Mapping simpanan harus memakai akun kewajiban aktif pada sisi Simpanan Anggota.");
  }

  return { version: Number(mapping.version), liabilityCode: account.code, eventCode: code };
}

export async function postSavingsTransaction(input: {
  organizationId: string;
  actorUserId: string;
  savingsAccountId: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER";
  treasuryAccountId: string;
  shiftId?: string | null;
  referenceNumber?: string | null;
  note?: string | null;
  idempotencyKey: string;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Nominal transaksi harus lebih dari Rp0.");
  }

  const db = getD1();
  const existing = await db
    .prepare(`SELECT resource_id FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1`)
    .bind(input.organizationId, input.idempotencyKey)
    .first<{ resource_id: string | null }>();
  if (existing?.resource_id) return existing.resource_id;

  const account = await getSavingsLedgerAccount(input.organizationId, input.savingsAccountId);
  if (!account || account.status !== "ACTIVE") throw new Error("Rekening ledger belum ACTIVE.");

  const treasury = await treasuryForPosting(input.organizationId, input.treasuryAccountId, input.paymentMethod);
  const eventCodeValue = input.type === "DEPOSIT" ? account.deposit_event_code : account.withdrawal_event_code;
  const mapping = await savingsMapping(input.organizationId, eventCodeValue, input.type);

  const transactionId = crypto.randomUUID();
  const journalId = crypto.randomUUID();
  const now = nowIso();
  const transactionNumber = documentNumber(input.type === "DEPOSIT" ? "SDEP" : "SWDR");
  const journalNumber = documentNumber("JRN-SAV");
  const delta = input.type === "DEPOSIT" ? input.amount : -input.amount;
  const debitCode = input.type === "DEPOSIT" ? treasury.chart_code : mapping.liabilityCode;
  const creditCode = input.type === "DEPOSIT" ? mapping.liabilityCode : treasury.chart_code;
  const description = `${input.type === "DEPOSIT" ? "Setoran" : "Penarikan"} simpanan ${account.account_number}`;

  const statements: D1PreparedLike[] = [
    db.prepare(`INSERT INTO request_idempotency (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,?,?,?,'COMPLETED',?,NULL)`)
      .bind(
        input.organizationId,
        input.idempotencyKey,
        `SAVINGS_${input.type}`,
        JSON.stringify({ account: account.id, amount: input.amount, method: input.paymentMethod }),
        transactionId,
        now,
      ),
    db.prepare(`INSERT INTO journal_entries (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'SAVINGS_TRANSACTION',?,?, 'POSTED',?,?,?)`)
      .bind(journalId, input.organizationId, journalNumber, transactionId, description, input.actorUserId, now, now),
    db.prepare(`INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,?,0,?,?)`)
      .bind(crypto.randomUUID(), journalId, debitCode, input.amount, description, now),
    db.prepare(`INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,0,?,?,?)`)
      .bind(crypto.randomUUID(), journalId, creditCode, input.amount, description, now),
    db.prepare(`INSERT INTO savings_ledger_transactions (
      id,organization_id,savings_account_id,transaction_number,transaction_type,amount,balance_delta_amount,payment_method,
      treasury_account_id,shift_id,reference_number,note,source_event_code,accounting_mapping_version,asset_account_code,liability_account_code,
      journal_entry_id,original_transaction_id,reversal_reason,actor_user_id,occurred_at,idempotency_key,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?)`)
      .bind(
        transactionId,
        input.organizationId,
        account.id,
        transactionNumber,
        input.type,
        input.amount,
        delta,
        input.paymentMethod,
        treasury.id,
        input.paymentMethod === "CASH" ? (input.shiftId || null) : null,
        input.referenceNumber?.trim() || null,
        input.note?.trim() || null,
        mapping.eventCode,
        mapping.version,
        treasury.chart_code,
        mapping.liabilityCode,
        journalId,
        input.actorUserId,
        now,
        input.idempotencyKey,
        now,
      ),
    db.prepare(`INSERT INTO transaction_audit_events (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,?,'SAVINGS_TRANSACTION',?,?,?)`)
      .bind(
        crypto.randomUUID(),
        input.organizationId,
        input.actorUserId,
        `SAVINGS_${input.type}_POSTED`,
        transactionId,
        JSON.stringify({
          accountNumber: account.account_number,
          amount: input.amount,
          method: input.paymentMethod,
          eventCode: mapping.eventCode,
          mappingVersion: mapping.version,
          assetAccount: treasury.chart_code,
          liabilityAccount: mapping.liabilityCode,
        }),
        now,
      ),
  ];

  await db.batch(statements);
  return transactionId;
}
