# Phase 4E-5C Production Status

Status: schema production applied; application code pending PR merge.

## Supabase migrations

- `20260818042506 phase_4e5c_loan_correction_settlement`
- `20260818042517 phase_4e5c_reversal_rerequest`
- `20260818042614 phase_4e5c_reversal_fk_indexes`

## Preflight data

At migration time there were 0 contracts with status `DISBURSED/CLOSED` and 0 `POSTED` loan repayments, so no active financial backfill was required.

## Verification

- `loan_repayment_reversals` and `loan_repayment_reversal_events` exist.
- RLS is enabled.
- `authenticated` has SELECT but no direct INSERT on reversal tables; `anon` has no direct SELECT.
- Active/final reversal uniqueness is enforced by `loan_repayment_reversals_active_repayment_uq`; rejected/cancelled requests may be re-requested.
- The three FK indexes identified after the first migration (`rejected_by`, `reversed_by`, `cancelled_by`) were added. Performance Advisor now reports no unindexed FK belonging to Phase 4E-5C. Existing `savings_accounts` FK findings predate this phase.
- Public correction/settlement RPCs remain intentional `SECURITY DEFINER` API boundaries with empty `search_path`, explicit authenticated execute grants, direct table writes revoked, and permission/state/maker-checker validation inside the functions.
- Security Advisor therefore reports `authenticated_security_definer_function_executable` for these privileged RPCs by design. Supabase Auth also still reports the global leaked-password-protection warning; neither condition was introduced silently by application table grants.

## Application verification

- Application CI #114: success.
- Application CI #116 after re-request hardening: success.
- Typecheck: success.
- Next.js production build: success.
- A final CI run is required for this documentation/index-source head before merge.

## Functional boundary

Implemented: append-only posted repayment reversal, maker-checker approval, idempotent D1 opposite journal, schedule restoration, contract reopen after reversal, and full contractual settlement without automatic interest rebate.

Not implemented here: reschedule/restructuring, configurable early-settlement interest rebate, write-off, or accounting reconciliation/aging-NPL reports. Those remain gated for the accounting/reconciliation phase.

No application deployment was performed in this phase.
