-- Phase 4E-5C post-migration performance hardening.
create index if not exists loan_repayment_reversals_rejected_by_idx
  on public.loan_repayment_reversals(rejected_by) where rejected_by is not null;
create index if not exists loan_repayment_reversals_reversed_by_idx
  on public.loan_repayment_reversals(reversed_by) where reversed_by is not null;
create index if not exists loan_repayment_reversals_cancelled_by_idx
  on public.loan_repayment_reversals(cancelled_by) where cancelled_by is not null;
