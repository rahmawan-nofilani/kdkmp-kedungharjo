# Phase 4E-6 Production Status

## Applied
Supabase production `kdkmp-kedungharjo` has `LOAN_REPORT_VIEW` active for:
- SUPER_ADMIN
- MANAGER
- PENGURUS
- PENGAWAS
- ADMIN_UNIT

Migration history contains two consecutive idempotent entries with the same descriptive name:
- `20260818044044 phase_4e6_loan_accounting_reconciliation`
- `20260818044057 phase_4e6_loan_accounting_reconciliation`

The second execution is a no-op for effective schema/data state because the permission upsert uses `ON CONFLICT ... DO UPDATE` and role mappings use `ON CONFLICT DO NOTHING`. Migration history is left intact rather than editing Supabase internal history manually.

## Verification
- Permission code/module/name verified live.
- Role mapping verified live.
- No new public table, view, RPC, SECURITY DEFINER function, RLS policy, or direct table grant is introduced by 4E-6.
- Performance Advisor: no new 4E-6 finding. Existing unindexed foreign keys on `savings_accounts` remain legacy cleanup work.
- Security Advisor: no new 4E-6 finding. Existing authenticated SECURITY DEFINER warnings belong to prior privileged loan RPCs; leaked-password protection remains a global Auth warning.

## Application behavior
- Supabase remains source of truth for loan operational state.
- D1 remains source of truth for journals/account balances.
- Report compares source IDs, journal IDs, components, overall receivable/revenue balances, and journal balance status.
- Aging uses operational DPD buckets; `91+` is an NPL proxy only.
- No automatic correction/restructure/write-off/rebate is performed.

## Preflight data state
At migration time there were 0 operational contracts, 0 DISBURSED disbursements, 0 POSTED repayments, and 0 REVERSED repayment reversals, so no financial backfill was required.
