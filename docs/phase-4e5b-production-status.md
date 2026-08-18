# Phase 4E-5B — Production Verification

Date: 2026-08-18 (Asia/Jakarta)

## Supabase migration

Applied to project `kdkmp-kedungharjo`:

- `20260818040938 phase_4e5b_loan_penalty_waiver`

## Application verification

- Application CI #111: **success**
- Typecheck: **success**
- Next.js production build: **success**

## Production preflight

Before migration:

- operational contracts (`DISBURSED` / `CLOSED`): 0
- repayments (`DRAFT` / `PROCESSING` / `POSTED`): 0
- approved loan products with `late_penalty_bps_per_day > 0`: 0
- penalty/waiver tables and permissions did not yet exist

No active financial data required backfill.

## Post-migration verification

- `loan_penalty_assessment_events`, `loan_penalty_waivers`, and `loan_penalty_waiver_events` exist
- RLS is enabled on new public tables
- `authenticated` has SELECT but no direct INSERT/UPDATE on waiver data
- `anon` has no direct SELECT
- schedule penalty assessed/waived columns are active
- temporary 4E-5 penalty-blocking guard has been removed
- private penalty assessment helper is not executable by authenticated or anon
- public RPCs use `SECURITY DEFINER`, empty `search_path`, explicit authenticated execute, and internal permission/state validation
- permission mappings match the intended VIEW / WAIVE_REQUEST / WAIVE_APPROVE roles
- Performance Advisor reports no new unindexed foreign keys from Phase 4E-5B; new indexes are currently reported as unused because the new tables are empty

## Security Advisor state

The linter reports `authenticated_security_definer_function_executable` for the intentionally exposed privileged RPC boundary. Direct table writes are revoked and each RPC validates authentication, organization permission, workflow state, and maker-checker rules.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

The project also still has the global `auth_leaked_password_protection` warning. This was not introduced by Phase 4E-5B.

Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Older `savings_accounts` foreign-key index notices remain outside this phase.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Financial behavior

- incremental late penalty is assessed only for newly elapsed overdue days
- penalty base is the current unpaid principal + interest for an installment
- grace period and penalty rate/minimum come from the immutable loan product snapshot
- sub-rupiah calculation remainder is retained as carry
- partial payment reduces the base used by later assessments
- repayment allocation order is `PENALTY -> INTEREST -> PRINCIPAL`, oldest installment first
- a repayment draft becomes stale if another penalty day accrues before posting
- waiver is stored separately from assessed penalty and requires maker-checker approval
- repayment creation is blocked while a waiver is DRAFT/SUBMITTED
- contract closure includes outstanding assessed penalty after paid/waived amounts

## Remaining loan lifecycle boundary

Not included in 4E-5B:

- reversal/correction of a posted repayment
- early/special settlement rules
- reschedule/restructuring
- write-off
- unified loan accounting/reconciliation and aging/NPL reporting

No application deployment is performed by this phase.
