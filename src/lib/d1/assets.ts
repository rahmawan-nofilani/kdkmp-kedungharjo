import { accountingPeriod, getAccountingIntegrity } from "./accounting";
import { getD1, type D1PreparedLike } from "./context";

export type FixedAssetRow = {
  id: string;
  asset_code: string;
  name: string;
  category: string | null;
  acquisition_date: string;
  in_service_date: string;
  acquisition_cost_amount: number;
  residual_value_amount: number;
  useful_life_months: number;
  depreciation_method: "STRAIGHT_LINE";
  status: "DRAFT" | "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED" | "CANCELLED";
  notes: string | null;
  created_by: string;
  approved_by: string | null;
  asset_account_id: string;
  asset_account_code: string;
  accumulated_depreciation_account_id: string;
  accumulated_account_code: string;
  depreciation_expense_account_id: string;
  expense_account_code: string;
  accumulated_depreciation_amount: number;
  book_value_amount: number;
};

export type DepreciationRunRow = {
  id: string;
  run_number: string;
  period_month: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  total_amount: number;
  asset_count: number;
  created_by: string;
  approved_by: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
  posted_at: string | null;
};

const ASSET_FOUNDATION = [
  { code: "1-1400", name: "Aset Tetap", type: "ASSET", normal: "DEBIT" },
  { code: "1-1490", name: "Akumulasi Penyusutan", type: "ASSET", normal: "CREDIT" },
  { code: "5-2000", name: "Beban Penyusutan", type: "EXPENSE", normal: "DEBIT" },
] as const;

function nowIso() { return new Date().toISOString(); }
function accountId(organizationId: string, code: string) { return `acct:${organizationId}:${code}`; }
function docNumber(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().replace(/-/g, "").slice(0,5).toUpperCase()}`;
}
function safeText(value: string, min: number, max: number, label: string) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`${label} harus ${min}–${max} karakter.`);
  return text;
}
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00+07:00`)); }
function validMonth(value: string) { return /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5,7)) >= 1 && Number(value.slice(5,7)) <= 12; }
function monthBounds(month: string) {
  if (!validMonth(month)) throw new Error("Bulan penyusutan tidak valid.");
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2,"0")}` };
}
function monthIndex(value: string) {
  const [year, month] = value.slice(0,7).split("-").map(Number);
  return year * 12 + month - 1;
}

export async function ensureAssetFoundation(organizationId: string) {
  const db = getD1();
  const now = nowIso();
  const statements: D1PreparedLike[] = ASSET_FOUNDATION.map((account) => db.prepare(`
    INSERT OR IGNORE INTO chart_of_accounts (
      id, organization_id, code, name, account_type, normal_balance,
      parent_account_id, status, is_system, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', 1, 'SYSTEM_ASSET_FOUNDATION', 'SYSTEM_ASSET_FOUNDATION', ?, ?)
  `).bind(accountId(organizationId, account.code), organizationId, account.code, account.name, account.type, account.normal, now, now));
  await db.batch(statements);
}

export async function listFixedAssets(organizationId: string) {
  await ensureAssetFoundation(organizationId);
  const db = getD1();
  const result = await db.prepare(`
    SELECT fa.id, fa.asset_code, fa.name, fa.category, fa.acquisition_date, fa.in_service_date,
           fa.acquisition_cost_amount, fa.residual_value_amount, fa.useful_life_months,
           fa.depreciation_method, fa.status, fa.notes, fa.created_by, fa.approved_by,
           fa.asset_account_id, aa.code AS asset_account_code,
           fa.accumulated_depreciation_account_id, ada.code AS accumulated_account_code,
           fa.depreciation_expense_account_id, dea.code AS expense_account_code,
           COALESCE((SELECT SUM(adl.depreciation_amount)
             FROM asset_depreciation_lines adl
             JOIN asset_depreciation_runs adr ON adr.id=adl.run_id
             WHERE adl.asset_id=fa.id AND adr.status='POSTED'),0) AS accumulated_depreciation_amount
    FROM fixed_assets fa
    JOIN chart_of_accounts aa ON aa.id=fa.asset_account_id
    JOIN chart_of_accounts ada ON ada.id=fa.accumulated_depreciation_account_id
    JOIN chart_of_accounts dea ON dea.id=fa.depreciation_expense_account_id
    WHERE fa.organization_id=?
    ORDER BY CASE fa.status WHEN 'DRAFT' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END, fa.asset_code
  `).bind(organizationId).all<Omit<FixedAssetRow,"book_value_amount">>();
  return result.results.map((row) => {
    const cost = Number(row.acquisition_cost_amount);
    const accumulated = Number(row.accumulated_depreciation_amount);
    return {
      ...row,
      acquisition_cost_amount: cost,
      residual_value_amount: Number(row.residual_value_amount),
      useful_life_months: Number(row.useful_life_months),
      accumulated_depreciation_amount: accumulated,
      book_value_amount: Math.max(Number(row.residual_value_amount), cost - accumulated),
    } satisfies FixedAssetRow;
  });
}

export async function createFixedAsset(input: {
  organizationId: string; actorUserId: string; assetCode: string; name: string; category?: string | null;
  acquisitionDate: string; inServiceDate: string; acquisitionCostAmount: number; residualValueAmount: number;
  usefulLifeMonths: number; assetAccountId: string; accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string; notes?: string | null;
}) {
  await ensureAssetFoundation(input.organizationId);
  const db = getD1();
  const code = input.assetCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error("Kode aset hanya boleh huruf, angka, _ atau - (3–30 karakter).");
  const name = safeText(input.name, 3, 120, "Nama aset");
  if (!validDate(input.acquisitionDate) || !validDate(input.inServiceDate)) throw new Error("Tanggal aset tidak valid.");
  if (input.inServiceDate < input.acquisitionDate) throw new Error("Tanggal mulai digunakan tidak boleh sebelum tanggal perolehan.");
  if (!Number.isSafeInteger(input.acquisitionCostAmount) || input.acquisitionCostAmount <= 0) throw new Error("Harga perolehan harus lebih dari nol.");
  if (!Number.isSafeInteger(input.residualValueAmount) || input.residualValueAmount < 0 || input.residualValueAmount >= input.acquisitionCostAmount) throw new Error("Nilai sisa harus nol atau lebih, tetapi lebih kecil dari harga perolehan.");
  if (!Number.isSafeInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1 || input.usefulLifeMonths > 600) throw new Error("Masa manfaat harus 1–600 bulan.");

  const accountRows = await db.prepare(`
    SELECT id, account_type, normal_balance, status FROM chart_of_accounts
    WHERE organization_id=? AND id IN (?,?,?)
  `).bind(input.organizationId, input.assetAccountId, input.accumulatedDepreciationAccountId, input.depreciationExpenseAccountId)
    .all<{ id:string; account_type:string; normal_balance:string; status:string }>();
  const accounts = new Map(accountRows.results.map((row) => [row.id,row]));
  const assetAccount = accounts.get(input.assetAccountId);
  const accumAccount = accounts.get(input.accumulatedDepreciationAccountId);
  const expenseAccount = accounts.get(input.depreciationExpenseAccountId);
  if (!assetAccount || assetAccount.status !== 'ACTIVE' || assetAccount.account_type !== 'ASSET') throw new Error("Akun Aset Tetap harus akun ASSET aktif.");
  if (!accumAccount || accumAccount.status !== 'ACTIVE' || accumAccount.account_type !== 'ASSET' || accumAccount.normal_balance !== 'CREDIT') throw new Error("Akun Akumulasi Penyusutan harus akun ASSET aktif dengan saldo normal KREDIT.");
  if (!expenseAccount || expenseAccount.status !== 'ACTIVE' || expenseAccount.account_type !== 'EXPENSE') throw new Error("Akun Beban Penyusutan harus akun EXPENSE aktif.");

  const id = crypto.randomUUID();
  const now = nowIso();
  await db.batch([
    db.prepare(`INSERT INTO fixed_assets (
      id, organization_id, asset_code, name, category, acquisition_date, in_service_date,
      acquisition_cost_amount, residual_value_amount, useful_life_months, depreciation_method,
      asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
      status, notes, created_by, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'STRAIGHT_LINE',?,?,?,'DRAFT',?,?,?,?)`)
      .bind(id,input.organizationId,code,name,input.category?.trim()||null,input.acquisitionDate,input.inServiceDate,
        input.acquisitionCostAmount,input.residualValueAmount,input.usefulLifeMonths,input.assetAccountId,
        input.accumulatedDepreciationAccountId,input.depreciationExpenseAccountId,input.notes?.trim()||null,input.actorUserId,now,now),
    db.prepare(`INSERT INTO transaction_audit_events
      (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?,?,?,'FIXED_ASSET_CREATED','FIXED_ASSET',?,?,?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,id,JSON.stringify({ assetCode:code,name,cost:input.acquisitionCostAmount,usefulLifeMonths:input.usefulLifeMonths }),now),
  ]);
  return id;
}

export async function activateFixedAsset(input: { organizationId:string; actorUserId:string; assetId:string }) {
  const db = getD1();
  const asset = await db.prepare("SELECT id,status,created_by,asset_code FROM fixed_assets WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.assetId,input.organizationId).first<{id:string;status:string;created_by:string;asset_code:string}>();
  if (!asset) throw new Error("Aset tidak ditemukan.");
  if (asset.status !== 'DRAFT') throw new Error("Hanya aset DRAFT yang dapat diaktifkan.");
  if (asset.created_by === input.actorUserId) throw new Error("Pembuat aset tidak boleh menjadi pemeriksa/penyetuju aset yang sama.");
  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE fixed_assets SET status='ACTIVE', approved_by=?, approved_at=?, updated_at=? WHERE id=? AND organization_id=? AND status='DRAFT'")
      .bind(input.actorUserId,now,now,asset.id,input.organizationId),
    db.prepare(`INSERT INTO transaction_audit_events
      (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?,?,?,'FIXED_ASSET_ACTIVATED','FIXED_ASSET',?,?,?)`)
      .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,asset.id,JSON.stringify({ assetCode:asset.asset_code }),now),
  ]);
}

export async function listDepreciationRuns(organizationId:string, limit=36) {
  const db = getD1();
  const safeLimit = Math.max(1,Math.min(120,Math.trunc(limit)));
  const result = await db.prepare(`SELECT id,run_number,period_month,status,total_amount,asset_count,created_by,approved_by,journal_entry_id,notes,created_at,posted_at
    FROM asset_depreciation_runs WHERE organization_id=? ORDER BY period_month DESC,created_at DESC LIMIT ${safeLimit}`)
    .bind(organizationId).all<DepreciationRunRow>();
  return result.results.map((row) => ({ ...row,total_amount:Number(row.total_amount),asset_count:Number(row.asset_count) }));
}

export async function createDepreciationRun(input:{ organizationId:string; actorUserId:string; periodMonth:string; notes?:string|null }) {
  await ensureAssetFoundation(input.organizationId);
  if (!validMonth(input.periodMonth)) throw new Error("Bulan penyusutan tidak valid.");
  const bounds = monthBounds(input.periodMonth);
  const db = getD1();
  const existing = await db.prepare("SELECT id,status FROM asset_depreciation_runs WHERE organization_id=? AND period_month=? LIMIT 1")
    .bind(input.organizationId,input.periodMonth).first<{id:string;status:string}>();
  if (existing) throw new Error(`Penyusutan bulan ${input.periodMonth} sudah memiliki proses (${existing.status}).`);
  const assets = await listFixedAssets(input.organizationId);
  const eligible = assets.filter((asset) => {
    if (asset.status !== 'ACTIVE') return false;
    if (asset.in_service_date > bounds.end) return false;
    const periodNo = monthIndex(input.periodMonth) - monthIndex(asset.in_service_date) + 1;
    return periodNo >= 1 && periodNo <= asset.useful_life_months && asset.book_value_amount > asset.residual_value_amount;
  });
  if (!eligible.length) throw new Error("Tidak ada aset aktif yang perlu disusutkan pada bulan ini.");

  const runId = crypto.randomUUID();
  const now = nowIso();
  const lines = eligible.map((asset) => {
    const base = asset.acquisition_cost_amount - asset.residual_value_amount;
    const periodNo = monthIndex(input.periodMonth) - monthIndex(asset.in_service_date) + 1;
    const remaining = Math.max(0, base - asset.accumulated_depreciation_amount);
    const regular = Math.max(1, Math.floor(base / asset.useful_life_months));
    const amount = Math.min(remaining, periodNo === asset.useful_life_months ? remaining : regular);
    return { asset, amount, beforeAccum:asset.accumulated_depreciation_amount, afterAccum:asset.accumulated_depreciation_amount+amount,
      bookBefore:asset.book_value_amount, bookAfter:Math.max(asset.residual_value_amount,asset.book_value_amount-amount) };
  }).filter((line) => line.amount > 0);
  if (!lines.length) throw new Error("Tidak ada nilai penyusutan yang perlu diposting.");
  const total = lines.reduce((sum,line) => sum+line.amount,0);
  const statements:D1PreparedLike[] = [
    db.prepare(`INSERT INTO asset_depreciation_runs
      (id,organization_id,run_number,period_month,status,total_amount,asset_count,created_by,notes,created_at,updated_at)
      VALUES (?,?,?,?,'DRAFT',?,?,?,?,?,?)`)
      .bind(runId,input.organizationId,docNumber('DEP'),input.periodMonth,total,lines.length,input.actorUserId,input.notes?.trim()||null,now,now),
  ];
  for (const line of lines) statements.push(db.prepare(`INSERT INTO asset_depreciation_lines
    (id,run_id,asset_id,depreciation_amount,accumulated_before_amount,accumulated_after_amount,book_value_before_amount,book_value_after_amount,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),runId,line.asset.id,line.amount,line.beforeAccum,line.afterAccum,line.bookBefore,line.bookAfter,now));
  statements.push(db.prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'DEPRECIATION_RUN_CREATED','ASSET_DEPRECIATION_RUN',?,?,?)`)
    .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,runId,JSON.stringify({ periodMonth:input.periodMonth,total,assetCount:lines.length }),now));
  await db.batch(statements);
  return runId;
}

export async function postDepreciationRun(input:{ organizationId:string; actorUserId:string; runId:string }) {
  const db = getD1();
  const run = await db.prepare("SELECT id,run_number,period_month,status,created_by,total_amount FROM asset_depreciation_runs WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.runId,input.organizationId).first<{id:string;run_number:string;period_month:string;status:string;created_by:string;total_amount:number}>();
  if (!run) throw new Error("Proses penyusutan tidak ditemukan.");
  if (run.status !== 'DRAFT') throw new Error("Hanya proses penyusutan DRAFT yang dapat diposting.");
  if (run.created_by === input.actorUserId) throw new Error("Pembuat proses penyusutan tidak boleh menjadi pemeriksa/penyetuju proses yang sama.");
  const linesResult = await db.prepare(`SELECT adl.id,adl.asset_id,adl.depreciation_amount,adl.book_value_after_amount,
      fa.residual_value_amount,fa.depreciation_expense_account_id,dea.code AS expense_code,
      fa.accumulated_depreciation_account_id,ada.code AS accumulated_code
    FROM asset_depreciation_lines adl JOIN fixed_assets fa ON fa.id=adl.asset_id
    JOIN chart_of_accounts dea ON dea.id=fa.depreciation_expense_account_id
    JOIN chart_of_accounts ada ON ada.id=fa.accumulated_depreciation_account_id
    WHERE adl.run_id=? ORDER BY fa.asset_code`)
    .bind(run.id).all<{id:string;asset_id:string;depreciation_amount:number;book_value_after_amount:number;residual_value_amount:number;depreciation_expense_account_id:string;expense_code:string;accumulated_depreciation_account_id:string;accumulated_code:string}>();
  if (!linesResult.results.length) throw new Error("Proses penyusutan tidak memiliki detail aset.");
  const bounds = monthBounds(run.period_month);
  const postedAt = new Date(Date.parse(`${bounds.end}T23:59:00+07:00`)).toISOString();
  const now = nowIso();
  const journalId = crypto.randomUUID();
  const statements:D1PreparedLike[] = [
    db.prepare(`INSERT INTO journal_entries
      (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'ASSET_DEPRECIATION',?,'Penyusutan aset tetap','POSTED',?,?,?)`)
      .bind(journalId,input.organizationId,`JRN-${run.run_number}`,run.id,input.actorUserId,postedAt,now),
  ];
  for (const line of linesResult.results) {
    const amount = Number(line.depreciation_amount);
    statements.push(db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,?,0,'Beban penyusutan aset',?)`).bind(crypto.randomUUID(),journalId,line.expense_code,amount,now));
    statements.push(db.prepare(`INSERT INTO journal_lines
      (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at)
      VALUES (?,?,?,0,?,'Akumulasi penyusutan aset',?)`).bind(crypto.randomUUID(),journalId,line.accumulated_code,amount,now));
    if (Number(line.book_value_after_amount) <= Number(line.residual_value_amount)) {
      statements.push(db.prepare("UPDATE fixed_assets SET status='FULLY_DEPRECIATED', updated_at=? WHERE id=? AND organization_id=? AND status='ACTIVE'")
        .bind(now,line.asset_id,input.organizationId));
    }
  }
  statements.push(db.prepare(`UPDATE asset_depreciation_runs SET status='POSTED',approved_by=?,journal_entry_id=?,posted_at=?,updated_at=?
    WHERE id=? AND organization_id=? AND status='DRAFT'`).bind(input.actorUserId,journalId,postedAt,now,run.id,input.organizationId));
  statements.push(db.prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,'DEPRECIATION_RUN_POSTED','ASSET_DEPRECIATION_RUN',?,?,?)`)
    .bind(crypto.randomUUID(),input.organizationId,input.actorUserId,run.id,JSON.stringify({ periodMonth:run.period_month,total:Number(run.total_amount),journalId }),now));
  await db.batch(statements);
  return journalId;
}

export async function getMonthClosingReadiness(organizationId:string, month:string) {
  const bounds = monthBounds(month);
  const period = accountingPeriod(bounds.start,bounds.end);
  const db = getD1();
  const [integrity,pendingJournal,bankCount,reconciledBanks,depreciationRun,assets,invoiceExceptions,periodRow] = await Promise.all([
    getAccountingIntegrity(organizationId,period),
    db.prepare(`SELECT COUNT(*) AS count FROM controlled_journals WHERE organization_id=? AND journal_date BETWEEN ? AND ? AND status IN ('DRAFT','SUBMITTED','APPROVED')`)
      .bind(organizationId,bounds.start,bounds.end).first<{count:number}>(),
    db.prepare("SELECT COUNT(*) AS count FROM treasury_accounts WHERE organization_id=? AND account_type='BANK' AND status='ACTIVE'")
      .bind(organizationId).first<{count:number}>(),
    db.prepare(`SELECT COUNT(DISTINCT brs.treasury_account_id) AS count FROM bank_reconciliation_sessions brs
      JOIN treasury_accounts ta ON ta.id=brs.treasury_account_id
      WHERE brs.organization_id=? AND ta.account_type='BANK' AND ta.status='ACTIVE' AND brs.status='RECONCILED' AND brs.period_start=? AND brs.period_end=?`)
      .bind(organizationId,bounds.start,bounds.end).first<{count:number}>(),
    db.prepare("SELECT status FROM asset_depreciation_runs WHERE organization_id=? AND period_month=? LIMIT 1")
      .bind(organizationId,month).first<{status:string}>(),
    listFixedAssets(organizationId),
    db.prepare(`SELECT COUNT(*) AS count FROM supplier_invoices WHERE organization_id=? AND invoice_date<=? AND status IN ('DRAFT','MISMATCH','MATCHED')`)
      .bind(organizationId,bounds.end).first<{count:number}>(),
    db.prepare("SELECT status FROM accounting_periods WHERE organization_id=? AND period_start=? AND period_end=? LIMIT 1")
      .bind(organizationId,bounds.start,bounds.end).first<{status:string}>(),
  ]);
  const assetsNeedDepreciation = assets.filter((asset) => {
    if (asset.status !== 'ACTIVE' || asset.in_service_date > bounds.end || asset.book_value_amount <= asset.residual_value_amount) return false;
    const periodNo = monthIndex(month)-monthIndex(asset.in_service_date)+1;
    return periodNo>=1 && periodNo<=asset.useful_life_months;
  }).length;
  const bankTotal = Number(bankCount?.count ?? 0);
  const bankDone = Number(reconciledBanks?.count ?? 0);
  const pending = Number(pendingJournal?.count ?? 0);
  const depreciationOk = assetsNeedDepreciation === 0 || depreciationRun?.status === 'POSTED';
  const checks = [
    { key:'journal', label:'Jurnal seimbang', passed:integrity.passed, detail:integrity.passed ? 'Semua jurnal periode ini seimbang.' : `${integrity.exceptions.length} jurnal perlu diperiksa.` },
    { key:'controlled', label:'Tidak ada jurnal yang masih menggantung', passed:pending===0, detail:pending===0 ? 'Tidak ada DRAFT/SUBMITTED/APPROVED yang belum selesai.' : `${pending} jurnal belum selesai.` },
    { key:'bank', label:'Pencocokan rekening bank selesai', passed:bankTotal===bankDone, detail:bankTotal===0 ? 'Belum ada rekening bank aktif.' : `${bankDone}/${bankTotal} rekening sudah direkonsiliasi.` },
    { key:'depreciation', label:'Penyusutan aset bulan ini selesai', passed:depreciationOk, detail:assetsNeedDepreciation===0 ? 'Tidak ada aset yang perlu disusutkan.' : depreciationRun?.status==='POSTED' ? `${assetsNeedDepreciation} aset sudah diproses.` : `${assetsNeedDepreciation} aset masih menunggu penyusutan.` },
  ];
  return {
    month,bounds,checks,ready:checks.every((check)=>check.passed),periodStatus:periodRow?.status ?? 'NOT_CREATED',
    invoiceAttention:Number(invoiceExceptions?.count ?? 0),assetsNeedDepreciation,
  };
}
