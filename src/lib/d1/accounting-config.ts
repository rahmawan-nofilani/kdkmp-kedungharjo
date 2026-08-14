import { getD1, type D1PreparedLike } from "./context";

export type AccountRow = {
  id: string;
  code: string;
  name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  normal_balance: "DEBIT" | "CREDIT";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  is_system: number;
};

export type MappingRow = {
  id: string;
  event_code: string;
  event_name: string;
  status: string;
  current_approved_version: number;
  version_id: string | null;
  version: number | null;
  version_status: string | null;
  debit_account_id: string | null;
  debit_code: string | null;
  debit_name: string | null;
  credit_account_id: string | null;
  credit_code: string | null;
  credit_name: string | null;
  change_note: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string | null;
  approved_at: string | null;
};

export const ACCOUNTING_EVENTS = [
  { code: "POS_CASH_REVENUE", name: "Penjualan tunai - pendapatan", debit: "1-1000", credit: "4-1000" },
  { code: "POS_COGS", name: "Penjualan - HPP dan persediaan", debit: "5-1000", credit: "1-1300" },
  { code: "PURCHASE_RECEIPT", name: "Penerimaan pembelian / GRNI", debit: "1-1300", credit: "2-1500" },
  { code: "SUPPLIER_INVOICE_APPROVED", name: "Invoice supplier approved", debit: "2-1500", credit: "2-1000" },
  { code: "SUPPLIER_PAYMENT_BANK", name: "Pembayaran supplier via bank", debit: "2-1000", credit: "1-1100" },
  { code: "SUPPLIER_PAYMENT_CASH", name: "Pembayaran supplier via kas", debit: "2-1000", credit: "1-1000" },
  { code: "SAVINGS_DEPOSIT", name: "Setoran simpanan anggota", debit: "1-1000", credit: "2-2000" },
  { code: "SAVINGS_WITHDRAWAL", name: "Penarikan simpanan anggota", debit: "2-2000", credit: "1-1000" },
] as const;

const FOUNDATION_ACCOUNTS = [
  { code: "1-1000", name: "Kas", type: "ASSET", normal: "DEBIT" },
  { code: "1-1100", name: "Bank", type: "ASSET", normal: "DEBIT" },
  { code: "1-1300", name: "Persediaan", type: "ASSET", normal: "DEBIT" },
  { code: "2-1000", name: "Hutang Supplier", type: "LIABILITY", normal: "CREDIT" },
  { code: "2-1500", name: "GRNI / Barang diterima belum ditagih", type: "LIABILITY", normal: "CREDIT" },
  { code: "2-2000", name: "Simpanan Anggota", type: "LIABILITY", normal: "CREDIT" },
  { code: "3-1000", name: "Modal / Ekuitas Dasar", type: "EQUITY", normal: "CREDIT" },
  { code: "4-1000", name: "Pendapatan Penjualan", type: "REVENUE", normal: "CREDIT" },
  { code: "5-1000", name: "Harga Pokok Penjualan", type: "EXPENSE", normal: "DEBIT" },
] as const;

function nowIso() {
  return new Date().toISOString();
}

function accountId(organizationId: string, code: string) {
  return `acct:${organizationId}:${code}`;
}

function mappingId(organizationId: string, eventCode: string) {
  return `map:${organizationId}:${eventCode}`;
}

function foundationVersionId(organizationId: string, eventCode: string) {
  return `mapv:${organizationId}:${eventCode}:1`;
}

export async function ensureAccountingFoundation(organizationId: string) {
  const db = getD1();
  const now = nowIso();
  const statements: D1PreparedLike[] = [];

  for (const account of FOUNDATION_ACCOUNTS) {
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO chart_of_accounts (
          id, organization_id, code, name, account_type, normal_balance,
          parent_account_id, status, is_system, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', 1, 'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
      `).bind(
        accountId(organizationId, account.code), organizationId, account.code, account.name,
        account.type, account.normal, now, now,
      ),
    );
  }

  for (const event of ACCOUNTING_EVENTS) {
    const mapId = mappingId(organizationId, event.code);
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO accounting_mappings (
          id, organization_id, event_code, event_name, status, current_approved_version,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', 1, 'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
      `).bind(mapId, organizationId, event.code, event.name, now, now),
    );
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO accounting_mapping_versions (
          id, mapping_id, version, debit_account_id, credit_account_id, status,
          change_note, created_by, approved_by, created_at, approved_at
        ) VALUES (?, ?, 1, ?, ?, 'APPROVED', 'Default accounting foundation',
                  'SYSTEM_FOUNDATION', 'SYSTEM_FOUNDATION', ?, ?)
      `).bind(
        foundationVersionId(organizationId, event.code), mapId,
        accountId(organizationId, event.debit), accountId(organizationId, event.credit), now, now,
      ),
    );
  }

  if (statements.length) await db.batch(statements);
}

export async function listAccounts(organizationId: string) {
  await ensureAccountingFoundation(organizationId);
  const db = getD1();
  const result = await db.prepare(`
    SELECT id, code, name, account_type, normal_balance, status, is_system
    FROM chart_of_accounts
    WHERE organization_id=?
    ORDER BY code
  `).bind(organizationId).all<AccountRow>();
  return result.results.map((row) => ({ ...row, is_system: Number(row.is_system) }));
}

export async function createAccount(input: {
  organizationId: string;
  actorUserId: string;
  code: string;
  name: string;
  accountType: AccountRow["account_type"];
  normalBalance: AccountRow["normal_balance"];
}) {
  const db = getD1();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[1-9][0-9]*-[0-9]{3,6}$/.test(code)) throw new Error("Format kode akun tidak valid. Contoh: 1-1200.");
  if (name.length < 3 || name.length > 120) throw new Error("Nama akun harus 3–120 karakter.");
  if (!["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"].includes(input.accountType)) throw new Error("Tipe akun tidak valid.");
  if (!["DEBIT","CREDIT"].includes(input.normalBalance)) throw new Error("Normal balance tidak valid.");

  const now = nowIso();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(`
      INSERT INTO chart_of_accounts (
        id, organization_id, code, name, account_type, normal_balance, parent_account_id,
        status, is_system, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', 0, ?, ?, ?, ?)
    `).bind(id, input.organizationId, code, name, input.accountType, input.normalBalance, input.actorUserId, input.actorUserId, now, now),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'ACCOUNT_CREATED', 'CHART_OF_ACCOUNT', ?, ?, ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, id, JSON.stringify({ code, name, accountType: input.accountType }), now),
  ]);
  return id;
}

export async function setAccountStatus(input: {
  organizationId: string;
  actorUserId: string;
  accountId: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}) {
  const db = getD1();
  const account = await db.prepare("SELECT id, code, status FROM chart_of_accounts WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.accountId, input.organizationId).first<{ id: string; code: string; status: string }>();
  if (!account) throw new Error("Akun tidak ditemukan.");
  if (!['ACTIVE','INACTIVE','ARCHIVED'].includes(input.status)) throw new Error("Status akun tidak valid.");
  if (account.status === input.status) return;
  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE chart_of_accounts SET status=?, updated_by=?, updated_at=? WHERE id=? AND organization_id=?")
      .bind(input.status, input.actorUserId, now, account.id, input.organizationId),
    db.prepare(`INSERT INTO transaction_audit_events
      (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'ACCOUNT_STATUS_CHANGED', 'CHART_OF_ACCOUNT', ?, ?, ?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, account.id, JSON.stringify({ code: account.code, from: account.status, to: input.status }), now),
  ]);
}

export async function listMappings(organizationId: string) {
  await ensureAccountingFoundation(organizationId);
  const db = getD1();
  const result = await db.prepare(`
    SELECT am.id, am.event_code, am.event_name, am.status, am.current_approved_version,
           amv.id AS version_id, amv.version, amv.status AS version_status,
           amv.debit_account_id, da.code AS debit_code, da.name AS debit_name,
           amv.credit_account_id, ca.code AS credit_code, ca.name AS credit_name,
           amv.change_note, amv.created_by, amv.approved_by, amv.created_at, amv.approved_at
    FROM accounting_mappings am
    LEFT JOIN accounting_mapping_versions amv
      ON amv.mapping_id=am.id
    LEFT JOIN chart_of_accounts da ON da.id=amv.debit_account_id
    LEFT JOIN chart_of_accounts ca ON ca.id=amv.credit_account_id
    WHERE am.organization_id=?
    ORDER BY am.event_code, amv.version DESC
  `).bind(organizationId).all<MappingRow>();
  return result.results.map((row) => ({
    ...row,
    current_approved_version: Number(row.current_approved_version),
    version: row.version === null ? null : Number(row.version),
  }));
}

export async function createMappingDraft(input: {
  organizationId: string;
  actorUserId: string;
  eventCode: string;
  debitAccountId: string;
  creditAccountId: string;
  changeNote: string;
}) {
  await ensureAccountingFoundation(input.organizationId);
  const db = getD1();
  const event = ACCOUNTING_EVENTS.find((item) => item.code === input.eventCode);
  if (!event) throw new Error("Event accounting tidak dikenal.");
  if (input.debitAccountId === input.creditAccountId) throw new Error("Debit dan kredit tidak boleh memakai akun yang sama.");
  const note = input.changeNote.trim();
  if (note.length < 8 || note.length > 240) throw new Error("Catatan perubahan wajib 8–240 karakter.");

  const [debit, credit, mapping] = await Promise.all([
    db.prepare("SELECT id FROM chart_of_accounts WHERE id=? AND organization_id=? AND status='ACTIVE' LIMIT 1")
      .bind(input.debitAccountId, input.organizationId).first<{ id: string }>(),
    db.prepare("SELECT id FROM chart_of_accounts WHERE id=? AND organization_id=? AND status='ACTIVE' LIMIT 1")
      .bind(input.creditAccountId, input.organizationId).first<{ id: string }>(),
    db.prepare("SELECT id FROM accounting_mappings WHERE organization_id=? AND event_code=? LIMIT 1")
      .bind(input.organizationId, event.code).first<{ id: string }>(),
  ]);
  if (!debit || !credit) throw new Error("Akun debit/kredit harus ACTIVE dan berasal dari organisasi yang sama.");
  if (!mapping) throw new Error("Accounting mapping foundation belum tersedia.");

  const existingDraft = await db.prepare("SELECT id FROM accounting_mapping_versions WHERE mapping_id=? AND status='DRAFT' LIMIT 1")
    .bind(mapping.id).first<{ id: string }>();
  if (existingDraft) throw new Error("Event ini masih memiliki draft mapping yang belum diputuskan.");

  const maxVersion = await db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM accounting_mapping_versions WHERE mapping_id=?")
    .bind(mapping.id).first<{ version: number }>();
  const version = Number(maxVersion?.version ?? 0) + 1;
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.batch([
    db.prepare(`INSERT INTO accounting_mapping_versions (
      id, mapping_id, version, debit_account_id, credit_account_id, status,
      change_note, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`)
      .bind(id, mapping.id, version, input.debitAccountId, input.creditAccountId, note, input.actorUserId, now),
    db.prepare(`INSERT INTO transaction_audit_events
      (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'ACCOUNTING_MAPPING_DRAFT_CREATED', 'ACCOUNTING_MAPPING_VERSION', ?, ?, ?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, id, JSON.stringify({ eventCode: event.code, version, note }), now),
  ]);
  return id;
}

export async function decideMappingDraft(input: {
  organizationId: string;
  actorUserId: string;
  versionId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string | null;
}) {
  const db = getD1();
  const row = await db.prepare(`
    SELECT amv.id, amv.mapping_id, amv.version, amv.status, amv.created_by,
           am.event_code, am.current_approved_version
    FROM accounting_mapping_versions amv
    JOIN accounting_mappings am ON am.id=amv.mapping_id
    WHERE amv.id=? AND am.organization_id=? LIMIT 1
  `).bind(input.versionId, input.organizationId).first<{
    id: string; mapping_id: string; version: number; status: string; created_by: string;
    event_code: string; current_approved_version: number;
  }>();
  if (!row) throw new Error("Draft mapping tidak ditemukan.");
  if (row.status !== "DRAFT") throw new Error("Hanya mapping DRAFT yang dapat diputuskan.");
  if (row.created_by === input.actorUserId) throw new Error("Maker-checker: pembuat draft mapping tidak boleh menjadi approver.");
  const now = nowIso();

  if (input.decision === "REJECT") {
    const reason = input.reason?.trim() || "";
    if (reason.length < 8 || reason.length > 240) throw new Error("Alasan reject wajib 8–240 karakter.");
    await db.batch([
      db.prepare("UPDATE accounting_mapping_versions SET status='REJECTED', rejected_by=?, rejection_reason=?, rejected_at=? WHERE id=? AND status='DRAFT'")
        .bind(input.actorUserId, reason, now, row.id),
      db.prepare(`INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
        VALUES (?, ?, ?, 'ACCOUNTING_MAPPING_REJECTED', 'ACCOUNTING_MAPPING_VERSION', ?, ?, ?)`)
        .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, row.id, JSON.stringify({ eventCode: row.event_code, version: Number(row.version), reason }), now),
    ]);
    return "REJECTED" as const;
  }

  const statements: D1PreparedLike[] = [];
  statements.push(
    db.prepare("UPDATE accounting_mapping_versions SET status='RETIRED' WHERE mapping_id=? AND status='APPROVED'")
      .bind(row.mapping_id),
    db.prepare("UPDATE accounting_mapping_versions SET status='APPROVED', approved_by=?, approved_at=? WHERE id=? AND status='DRAFT'")
      .bind(input.actorUserId, now, row.id),
    db.prepare("UPDATE accounting_mappings SET current_approved_version=?, updated_by=?, updated_at=? WHERE id=? AND organization_id=?")
      .bind(Number(row.version), input.actorUserId, now, row.mapping_id, input.organizationId),
    db.prepare(`INSERT INTO transaction_audit_events
      (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'ACCOUNTING_MAPPING_APPROVED', 'ACCOUNTING_MAPPING_VERSION', ?, ?, ?)`)
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, row.id, JSON.stringify({ eventCode: row.event_code, version: Number(row.version) }), now),
  );
  await db.batch(statements);
  return "APPROVED" as const;
}

export async function getActiveAccountingMapping(organizationId: string, eventCode: string) {
  await ensureAccountingFoundation(organizationId);
  const db = getD1();
  return db.prepare(`
    SELECT am.event_code, am.event_name, amv.version,
           da.code AS debit_code, da.name AS debit_name,
           ca.code AS credit_code, ca.name AS credit_name
    FROM accounting_mappings am
    JOIN accounting_mapping_versions amv
      ON amv.mapping_id=am.id
     AND amv.version=am.current_approved_version
     AND amv.status='APPROVED'
    JOIN chart_of_accounts da ON da.id=amv.debit_account_id AND da.status='ACTIVE'
    JOIN chart_of_accounts ca ON ca.id=amv.credit_account_id AND ca.status='ACTIVE'
    WHERE am.organization_id=? AND am.event_code=? AND am.status='ACTIVE'
    LIMIT 1
  `).bind(organizationId, eventCode).first<{
    event_code: string; event_name: string; version: number;
    debit_code: string; debit_name: string; credit_code: string; credit_name: string;
  }>();
}
