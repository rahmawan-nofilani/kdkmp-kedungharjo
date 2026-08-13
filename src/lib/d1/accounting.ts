import { getD1 } from "./context";

export type TrialBalanceRow = {
  account_code: string;
  debit_amount: number;
  credit_amount: number;
  balance_amount: number;
};

export type JournalSummaryRow = {
  id: string;
  entry_number: string;
  source_type: string;
  source_id: string;
  description: string;
  status: string;
  posted_at: string | null;
  created_at: string;
  debit_amount: number;
  credit_amount: number;
  line_count: number;
  balanced: boolean;
};

export type LedgerLineRow = {
  journal_entry_id: string;
  entry_number: string;
  source_type: string;
  source_id: string;
  description: string;
  posted_at: string | null;
  created_at: string;
  account_code: string;
  debit_amount: number;
  credit_amount: number;
  memo: string | null;
};

export type AccountingPeriod = {
  from: string;
  to: string;
  fromIso: string;
  toExclusiveIso: string;
};

export const FOUNDATION_ACCOUNT_NAMES: Record<string, string> = {
  "1-1000": "Kas",
  "1-1100": "Bank",
  "1-1300": "Persediaan",
  "2-1000": "Hutang Supplier",
  "2-1500": "GRNI / Barang diterima belum ditagih",
  "4-1000": "Pendapatan Penjualan",
  "5-1000": "Harga Pokok Penjualan",
};

export function foundationAccountName(code: string) {
  return FOUNDATION_ACCOUNT_NAMES[code] || `Akun ${code}`;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00+07:00`));
}

export function accountingPeriod(from: string, to: string): AccountingPeriod {
  if (!validDate(from) || !validDate(to)) throw new Error("Periode akuntansi tidak valid.");
  const fromMs = Date.parse(`${from}T00:00:00+07:00`);
  const toMs = Date.parse(`${to}T00:00:00+07:00`);
  if (fromMs > toMs) throw new Error("Tanggal awal tidak boleh setelah tanggal akhir.");
  const maxDays = 366;
  if (toMs - fromMs > maxDays * 86_400_000) throw new Error("Maksimal periode laporan adalah 366 hari.");
  return {
    from,
    to,
    fromIso: new Date(fromMs).toISOString(),
    toExclusiveIso: new Date(toMs + 86_400_000).toISOString(),
  };
}

export async function getTrialBalance(organizationId: string, period: AccountingPeriod) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT
        jl.account_code,
        COALESCE(SUM(jl.debit_amount), 0) AS debit_amount,
        COALESCE(SUM(jl.credit_amount), 0) AS credit_amount
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.organization_id = ?
        AND je.status = 'POSTED'
        AND COALESCE(je.posted_at, je.created_at) >= ?
        AND COALESCE(je.posted_at, je.created_at) < ?
      GROUP BY jl.account_code
      ORDER BY jl.account_code
    `)
    .bind(organizationId, period.fromIso, period.toExclusiveIso)
    .all<{ account_code: string; debit_amount: number; credit_amount: number }>();

  return result.results.map((row) => {
    const debit = Number(row.debit_amount);
    const credit = Number(row.credit_amount);
    return {
      account_code: row.account_code,
      debit_amount: debit,
      credit_amount: credit,
      balance_amount: debit - credit,
    } satisfies TrialBalanceRow;
  });
}

export async function listJournalSummaries(
  organizationId: string,
  period: AccountingPeriod,
  limit = 120,
) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await db
    .prepare(`
      SELECT
        je.id,
        je.entry_number,
        je.source_type,
        je.source_id,
        je.description,
        je.status,
        je.posted_at,
        je.created_at,
        COALESCE(SUM(jl.debit_amount), 0) AS debit_amount,
        COALESCE(SUM(jl.credit_amount), 0) AS credit_amount,
        COUNT(jl.id) AS line_count
      FROM journal_entries je
      LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.organization_id = ?
        AND COALESCE(je.posted_at, je.created_at) >= ?
        AND COALESCE(je.posted_at, je.created_at) < ?
      GROUP BY je.id
      ORDER BY COALESCE(je.posted_at, je.created_at) DESC, je.created_at DESC
      LIMIT ${safeLimit}
    `)
    .bind(organizationId, period.fromIso, period.toExclusiveIso)
    .all<Omit<JournalSummaryRow, "balanced">>();

  return result.results.map((row) => {
    const debit = Number(row.debit_amount);
    const credit = Number(row.credit_amount);
    return {
      ...row,
      debit_amount: debit,
      credit_amount: credit,
      line_count: Number(row.line_count),
      balanced: debit > 0 && debit === credit,
    } satisfies JournalSummaryRow;
  });
}

export async function listLedgerLines(
  organizationId: string,
  period: AccountingPeriod,
  accountCode?: string | null,
  limit = 250,
) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const code = accountCode?.trim() || null;
  const query = code
    ? `
      SELECT je.id AS journal_entry_id, je.entry_number, je.source_type, je.source_id,
             je.description, je.posted_at, je.created_at, jl.account_code,
             jl.debit_amount, jl.credit_amount, jl.memo
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.organization_id = ? AND je.status='POSTED'
        AND COALESCE(je.posted_at, je.created_at) >= ?
        AND COALESCE(je.posted_at, je.created_at) < ?
        AND jl.account_code = ?
      ORDER BY COALESCE(je.posted_at, je.created_at) DESC, jl.created_at DESC
      LIMIT ${safeLimit}`
    : `
      SELECT je.id AS journal_entry_id, je.entry_number, je.source_type, je.source_id,
             je.description, je.posted_at, je.created_at, jl.account_code,
             jl.debit_amount, jl.credit_amount, jl.memo
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.organization_id = ? AND je.status='POSTED'
        AND COALESCE(je.posted_at, je.created_at) >= ?
        AND COALESCE(je.posted_at, je.created_at) < ?
      ORDER BY COALESCE(je.posted_at, je.created_at) DESC, jl.created_at DESC
      LIMIT ${safeLimit}`;

  const prepared = db.prepare(query);
  const result = code
    ? await prepared.bind(organizationId, period.fromIso, period.toExclusiveIso, code).all<LedgerLineRow>()
    : await prepared.bind(organizationId, period.fromIso, period.toExclusiveIso).all<LedgerLineRow>();

  return result.results.map((row) => ({
    ...row,
    debit_amount: Number(row.debit_amount),
    credit_amount: Number(row.credit_amount),
  }));
}

export async function getAccountingIntegrity(organizationId: string, period: AccountingPeriod) {
  const db = getD1();
  const [summary, unbalanced] = await Promise.all([
    db
      .prepare(`
        SELECT COUNT(DISTINCT je.id) AS entry_count,
               COUNT(jl.id) AS line_count,
               COALESCE(SUM(jl.debit_amount),0) AS total_debit,
               COALESCE(SUM(jl.credit_amount),0) AS total_credit
        FROM journal_entries je
        LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
        WHERE je.organization_id=?
          AND je.status='POSTED'
          AND COALESCE(je.posted_at, je.created_at) >= ?
          AND COALESCE(je.posted_at, je.created_at) < ?
      `)
      .bind(organizationId, period.fromIso, period.toExclusiveIso)
      .first<{ entry_count: number; line_count: number; total_debit: number; total_credit: number }>(),
    db
      .prepare(`
        SELECT je.id, je.entry_number, je.source_type, je.source_id, je.description,
               je.status, je.posted_at, je.created_at,
               COALESCE(SUM(jl.debit_amount),0) AS debit_amount,
               COALESCE(SUM(jl.credit_amount),0) AS credit_amount,
               COUNT(jl.id) AS line_count
        FROM journal_entries je
        LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
        WHERE je.organization_id=?
          AND je.status='POSTED'
          AND COALESCE(je.posted_at, je.created_at) >= ?
          AND COALESCE(je.posted_at, je.created_at) < ?
        GROUP BY je.id
        HAVING COALESCE(SUM(jl.debit_amount),0) <> COALESCE(SUM(jl.credit_amount),0)
            OR COALESCE(SUM(jl.debit_amount),0) = 0
            OR COUNT(jl.id) < 2
        ORDER BY COALESCE(je.posted_at, je.created_at) DESC
        LIMIT 50
      `)
      .bind(organizationId, period.fromIso, period.toExclusiveIso)
      .all<Omit<JournalSummaryRow, "balanced">>(),
  ]);

  const totalDebit = Number(summary?.total_debit ?? 0);
  const totalCredit = Number(summary?.total_credit ?? 0);
  const exceptions = unbalanced.results.map((row) => ({
    ...row,
    debit_amount: Number(row.debit_amount),
    credit_amount: Number(row.credit_amount),
    line_count: Number(row.line_count),
    balanced: false,
  }));

  return {
    entryCount: Number(summary?.entry_count ?? 0),
    lineCount: Number(summary?.line_count ?? 0),
    totalDebit,
    totalCredit,
    exceptions,
    passed: totalDebit === totalCredit && exceptions.length === 0,
  };
}

export function buildFinancialReadModel(trialBalance: TrialBalanceRow[]) {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let expenses = 0;

  for (const row of trialBalance) {
    const debitNormal = row.debit_amount - row.credit_amount;
    const creditNormal = row.credit_amount - row.debit_amount;
    if (row.account_code.startsWith("1-")) assets += debitNormal;
    else if (row.account_code.startsWith("2-")) liabilities += creditNormal;
    else if (row.account_code.startsWith("3-")) equity += creditNormal;
    else if (row.account_code.startsWith("4-")) revenue += creditNormal;
    else if (row.account_code.startsWith("5-") || row.account_code.startsWith("6-")) expenses += debitNormal;
  }

  const netIncome = revenue - expenses;
  const equationGap = assets - (liabilities + equity + netIncome);
  const cash = trialBalance
    .filter((row) => row.account_code === "1-1000")
    .reduce((sum, row) => sum + row.debit_amount - row.credit_amount, 0);
  const bank = trialBalance
    .filter((row) => row.account_code === "1-1100")
    .reduce((sum, row) => sum + row.debit_amount - row.credit_amount, 0);
  const inventory = trialBalance
    .filter((row) => row.account_code === "1-1300")
    .reduce((sum, row) => sum + row.debit_amount - row.credit_amount, 0);
  const ap = trialBalance
    .filter((row) => row.account_code === "2-1000")
    .reduce((sum, row) => sum + row.credit_amount - row.debit_amount, 0);
  const grni = trialBalance
    .filter((row) => row.account_code === "2-1500")
    .reduce((sum, row) => sum + row.credit_amount - row.debit_amount, 0);

  return {
    assets,
    liabilities,
    equity,
    revenue,
    expenses,
    netIncome,
    equationGap,
    cash,
    bank,
    inventory,
    accountsPayable: ap,
    grni,
  };
}
