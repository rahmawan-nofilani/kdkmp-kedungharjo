# Phase 4E-6 — Loan Accounting & Reconciliation

## Source-of-truth boundary
- Supabase: contract, installment schedule, disbursement/repayment/reversal workflow state.
- D1: posted journals and account balances.
- No duplicate reporting ledger or balance snapshot is stored.

## Reconciliation controls
- Principal outstanding from Supabase schedule vs D1 account `1-1200`.
- Realized interest from POSTED repayments net of REVERSED repayments vs D1 `4-1100`.
- Realized penalty from POSTED repayments net of REVERSED repayments vs D1 `4-1200`.
- Per-source checks for missing, orphan, duplicate, unbalanced, wrong journal id, and component mismatch.

## Aging
- DPD is based on the oldest installment due date with contractual outstanding.
- Operational buckets: CURRENT, 1–30, 31–60, 61–90, 91+ days.
- 91+ days is explicitly labeled an operational NPL proxy, not a regulatory classification.

## Safety
- Report is read-only.
- No automatic correction, write-off, restructuring, reschedule, or interest rebate.
- Permission `LOAN_REPORT_VIEW` is mapped to supervisory/management roles.
