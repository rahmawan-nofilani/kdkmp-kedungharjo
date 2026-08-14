import { getD1 } from "./context";

export type SavingsIntegrityIssue = {
  code: string;
  title: string;
  detail: string;
  count: number;
};

export type SavingsProductBalance = {
  product_code: string;
  product_name: string;
  account_count: number;
  transaction_count: number;
  balance_amount: number;
};

export type SavingsIntegrityReport = {
  metrics: {
    ledgerAccounts: number;
    transactions: number;
    totalBalance: number;
    negativeAccounts: number;
    missingOrInvalidJournals: number;
    amountMismatchJournals: number;
    liabilityMismatchGroups: number;
  };
  passed: boolean;
  issues: SavingsIntegrityIssue[];
  products: SavingsProductBalance[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getSavingsIntegrityReport(organizationId: string): Promise<SavingsIntegrityReport> {
  const db = getD1();

  const [metricsRow, negativeRow, journalRow, amountRow, liabilityRow, productsResult] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM savings_ledger_accounts WHERE organization_id=?) AS ledger_accounts,
        (SELECT COUNT(*) FROM savings_ledger_transactions WHERE organization_id=?) AS transactions,
        (SELECT COALESCE(SUM(balance_delta_amount),0) FROM savings_ledger_transactions WHERE organization_id=?) AS total_balance
    `).bind(organizationId, organizationId, organizationId).first<{ledger_accounts:number;transactions:number;total_balance:number}>(),

    db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT a.id
        FROM savings_ledger_accounts a
        LEFT JOIN savings_ledger_transactions t
          ON t.organization_id=a.organization_id AND t.savings_account_id=a.id
        WHERE a.organization_id=?
        GROUP BY a.id
        HAVING COALESCE(SUM(t.balance_delta_amount),0) < 0
      ) x
    `).bind(organizationId).first<{count:number}>(),

    db.prepare(`
      SELECT COUNT(*) AS count
      FROM savings_ledger_transactions t
      LEFT JOIN journal_entries je ON je.id=t.journal_entry_id
      WHERE t.organization_id=? AND (
        je.id IS NULL OR je.organization_id<>t.organization_id OR je.status<>'POSTED' OR je.source_id<>t.id OR
        (t.transaction_type='REVERSAL' AND je.source_type<>'SAVINGS_REVERSAL') OR
        (t.transaction_type<>'REVERSAL' AND je.source_type<>'SAVINGS_TRANSACTION')
      )
    `).bind(organizationId).first<{count:number}>(),

    db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT t.id, t.amount,
          COUNT(jl.id) AS line_count,
          COALESCE(SUM(jl.debit_amount),0) AS debit_amount,
          COALESCE(SUM(jl.credit_amount),0) AS credit_amount
        FROM savings_ledger_transactions t
        LEFT JOIN journal_lines jl ON jl.journal_entry_id=t.journal_entry_id
        WHERE t.organization_id=?
        GROUP BY t.id, t.amount
        HAVING COUNT(jl.id)<>2
          OR COALESCE(SUM(jl.debit_amount),0)<>t.amount
          OR COALESCE(SUM(jl.credit_amount),0)<>t.amount
      ) x
    `).bind(organizationId).first<{count:number}>(),

    db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT t.liability_account_code,
          COALESCE(SUM(t.balance_delta_amount),0) AS ledger_balance,
          COALESCE(SUM(CASE WHEN jl.account_code=t.liability_account_code THEN jl.credit_amount-jl.debit_amount ELSE 0 END),0) AS journal_balance
        FROM savings_ledger_transactions t
        LEFT JOIN journal_lines jl ON jl.journal_entry_id=t.journal_entry_id
        WHERE t.organization_id=?
        GROUP BY t.liability_account_code
        HAVING COALESCE(SUM(t.balance_delta_amount),0) <>
          COALESCE(SUM(CASE WHEN jl.account_code=t.liability_account_code THEN jl.credit_amount-jl.debit_amount ELSE 0 END),0)
      ) x
    `).bind(organizationId).first<{count:number}>(),

    db.prepare(`
      SELECT a.product_code, a.product_name,
        COUNT(DISTINCT a.id) AS account_count,
        COUNT(t.id) AS transaction_count,
        COALESCE(SUM(t.balance_delta_amount),0) AS balance_amount
      FROM savings_ledger_accounts a
      LEFT JOIN savings_ledger_transactions t
        ON t.organization_id=a.organization_id AND t.savings_account_id=a.id
      WHERE a.organization_id=?
      GROUP BY a.product_code, a.product_name
      ORDER BY a.product_code
    `).bind(organizationId).all<SavingsProductBalance>(),
  ]);

  const negativeAccounts = number(negativeRow?.count);
  const missingOrInvalidJournals = number(journalRow?.count);
  const amountMismatchJournals = number(amountRow?.count);
  const liabilityMismatchGroups = number(liabilityRow?.count);

  const issues: SavingsIntegrityIssue[] = [];
  if (negativeAccounts) issues.push({code:"NEGATIVE_BALANCE",title:"Saldo rekening negatif",detail:"Ada rekening yang hasil seluruh mutasinya berada di bawah Rp0.",count:negativeAccounts});
  if (missingOrInvalidJournals) issues.push({code:"JOURNAL_LINK",title:"Jurnal transaksi tidak lengkap",detail:"Ada transaksi Simpanan yang tidak terhubung ke jurnal POSTED dengan sumber yang sesuai.",count:missingOrInvalidJournals});
  if (amountMismatchJournals) issues.push({code:"JOURNAL_AMOUNT",title:"Nominal jurnal tidak cocok",detail:"Debit/kredit jurnal tidak sama dengan nominal transaksi Simpanan.",count:amountMismatchJournals});
  if (liabilityMismatchGroups) issues.push({code:"LIABILITY_RECON",title:"Saldo kewajiban tidak cocok",detail:"Saldo mutasi Simpanan berbeda dengan saldo jurnal pada akun kewajiban terkait.",count:liabilityMismatchGroups});

  return {
    metrics: {
      ledgerAccounts: number(metricsRow?.ledger_accounts),
      transactions: number(metricsRow?.transactions),
      totalBalance: number(metricsRow?.total_balance),
      negativeAccounts,
      missingOrInvalidJournals,
      amountMismatchJournals,
      liabilityMismatchGroups,
    },
    passed: issues.length===0,
    issues,
    products: productsResult.results.map((row)=>({
      ...row,
      account_count:number(row.account_count),
      transaction_count:number(row.transaction_count),
      balance_amount:number(row.balance_amount),
    })),
  };
}
