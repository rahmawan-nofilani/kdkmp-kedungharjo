# Phase 4E-3 — Production Status

Status: **schema applied and verified** on the Supabase project `kdkmp-kedungharjo` on 2026-08-18.

Applied migrations:

- `phase_4e3_loan_contracts_schedule`
- `phase_4e3_loan_contract_fk_indexes`

Verification performed after migration:

- `public.loan_contracts` exists and RLS is enabled.
- `public.loan_installment_schedule` exists and RLS is enabled.
- `LOAN_CONTRACT_VIEW` and `LOAN_CONTRACT_MANAGE` permissions exist.
- `authenticated` has SELECT on both registry tables but no direct INSERT or UPDATE access.
- `anon` cannot execute `public.create_loan_contract(uuid,date)`.
- `authenticated` can execute the contract RPC; the RPC performs explicit `auth.uid()` and organization-permission checks before privileged writes.
- Supabase Performance Advisor reports no Phase 4E-3 unindexed foreign keys after the follow-up index migration.

## Security advisor note

Supabase reports `authenticated_security_definer_function_executable` for `public.create_loan_contract(uuid,date)`. This is intentional for this phase because direct writes to the append-only contract/schedule tables are revoked and the RPC is the only write boundary. The function uses an empty `search_path`, checks `auth.uid()`, checks `private.has_org_permission(..., 'LOAN_CONTRACT_MANAGE')`, validates the approved application and product snapshot, and execute is revoked from `public` and `anon`.

The separate `auth_leaked_password_protection` warning is a project-wide Auth configuration item and was not introduced by Phase 4E-3.

## Scope boundary

Phase 4E-3 does not disburse funds, post accounting journals, receive installments, write to D1 `savings_ledger_v11`, or enable POS payment from savings.
