import { getD1 } from "./context";

export type LoanAccountingJournalRow = {
  journal_id: string;
  source_type: "LOAN_DISBURSEMENT" | "LOAN_REPAYMENT" | "LOAN_REPAYMENT_REVERSAL";
  source_id: string;
  entry_number: string;
  posted_at: string | null;
  debit_amount: number;
  credit_amount: number;
  receivable_net: number;
  interest_revenue_net: number;
  penalty_revenue_net: number;
  balanced: boolean;
};

export type LoanAccountingSnapshot = {
  receivableBalance: number;
  interestRevenue: number;
  penaltyRevenue: number;
  journals: LoanAccountingJournalRow[];
  duplicateSources: string[];
  unbalancedJournalIds: string[];
};

export async function getLoanAccountingSnapshot(organizationId: string): Promise<LoanAccountingSnapshot> {
  const db = getD1();
  const [balancesResult, journalsResult] = await Promise.all([
    db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN jl.account_code='1-1200' THEN jl.debit_amount-jl.credit_amount ELSE 0 END),0) AS receivable_balance,
        COALESCE(SUM(CASE WHEN jl.account_code='4-1100' THEN jl.credit_amount-jl.debit_amount ELSE 0 END),0) AS interest_revenue,
        COALESCE(SUM(CASE WHEN jl.account_code='4-1200' THEN jl.credit_amount-jl.debit_amount ELSE 0 END),0) AS penalty_revenue
      FROM journal_lines jl
      JOIN journal_entries je ON je.id=jl.journal_entry_id
      WHERE je.organization_id=? AND je.status='POSTED'
    `).bind(organizationId).first<{receivable_balance:number;interest_revenue:number;penalty_revenue:number}>(),
    db.prepare(`
      SELECT
        je.id AS journal_id,
        je.source_type,
        je.source_id,
        je.entry_number,
        je.posted_at,
        COALESCE(SUM(jl.debit_amount),0) AS debit_amount,
        COALESCE(SUM(jl.credit_amount),0) AS credit_amount,
        COALESCE(SUM(CASE WHEN jl.account_code='1-1200' THEN jl.debit_amount-jl.credit_amount ELSE 0 END),0) AS receivable_net,
        COALESCE(SUM(CASE WHEN jl.account_code='4-1100' THEN jl.credit_amount-jl.debit_amount ELSE 0 END),0) AS interest_revenue_net,
        COALESCE(SUM(CASE WHEN jl.account_code='4-1200' THEN jl.credit_amount-jl.debit_amount ELSE 0 END),0) AS penalty_revenue_net
      FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id=je.id
      WHERE je.organization_id=?
        AND je.status='POSTED'
        AND je.source_type IN ('LOAN_DISBURSEMENT','LOAN_REPAYMENT','LOAN_REPAYMENT_REVERSAL')
      GROUP BY je.id
      ORDER BY COALESCE(je.posted_at,je.created_at) DESC
      LIMIT 1000
    `).bind(organizationId).all<Omit<LoanAccountingJournalRow,"balanced">>(),
  ]);

  const journals: LoanAccountingJournalRow[] = journalsResult.results.map((row) => {
    const debit = Number(row.debit_amount || 0);
    const credit = Number(row.credit_amount || 0);
    return {
      ...row,
      debit_amount: debit,
      credit_amount: credit,
      receivable_net: Number(row.receivable_net || 0),
      interest_revenue_net: Number(row.interest_revenue_net || 0),
      penalty_revenue_net: Number(row.penalty_revenue_net || 0),
      balanced: debit > 0 && debit === credit,
    };
  });

  const sourceCounts = new Map<string,number>();
  for (const row of journals) {
    const key=`${row.source_type}:${row.source_id}`;
    sourceCounts.set(key,(sourceCounts.get(key)||0)+1);
  }

  return {
    receivableBalance: Number(balancesResult?.receivable_balance || 0),
    interestRevenue: Number(balancesResult?.interest_revenue || 0),
    penaltyRevenue: Number(balancesResult?.penalty_revenue || 0),
    journals,
    duplicateSources: Array.from(sourceCounts.entries()).filter(([,count])=>count>1).map(([key])=>key),
    unbalancedJournalIds: journals.filter((row)=>!row.balanced).map((row)=>row.journal_id),
  };
}
