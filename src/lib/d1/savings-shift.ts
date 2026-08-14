import { getD1 } from "./context";

export async function getSavingsShiftCashSummary(organizationId:string,shiftId:string){
  const db=getD1();
  const table=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='savings_ledger_transactions' LIMIT 1").first<{name:string}>();
  if(!table?.name)return {cashDeltaAmount:0,transactionCount:0,journalIssueCount:0,issues:[] as Array<{id:string;number:string;message:string}>};

  const rows=await db.prepare(`SELECT t.id,t.transaction_number,t.balance_delta_amount,
      COALESCE(SUM(jl.debit_amount),0) AS debit_amount,COALESCE(SUM(jl.credit_amount),0) AS credit_amount
    FROM savings_ledger_transactions t
    LEFT JOIN journal_entries je ON je.id=t.journal_entry_id
    LEFT JOIN journal_lines jl ON jl.journal_entry_id=je.id
    WHERE t.organization_id=? AND t.shift_id=? AND t.payment_method='CASH'
    GROUP BY t.id,t.transaction_number,t.balance_delta_amount
    ORDER BY t.occurred_at`).bind(organizationId,shiftId)
    .all<{id:string;transaction_number:string;balance_delta_amount:number;debit_amount:number;credit_amount:number}>();

  let cashDeltaAmount=0;
  const issues:Array<{id:string;number:string;message:string}>=[];
  for(const row of rows.results){
    const delta=Number(row.balance_delta_amount); const debit=Number(row.debit_amount); const credit=Number(row.credit_amount);
    cashDeltaAmount+=delta;
    if(debit<=0||debit!==credit)issues.push({id:row.id,number:row.transaction_number,message:`Jurnal simpanan tidak balance (${debit}/${credit}).`});
  }
  return {cashDeltaAmount,transactionCount:rows.results.length,journalIssueCount:issues.length,issues};
}
