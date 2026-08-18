# KDKMP Kedungharjo

Production-oriented operational platform for Koperasi Desa Merah Putih Kedungharjo.

## Current web scope
Implemented foundations include:
- identity, organization access, and role-based permissions
- member master
- inventory and procurement/AP
- finance, treasury, journals, accounting configuration, assets, and closing readiness
- controlled CASH POS with teller shift reconciliation and maker-checker void/refund
- configurable savings products, accounts, transactions, and integrity reporting
- configurable loan products, application/eligibility, contracts/schedules, disbursement, repayments, penalty/waiver, repayment reversal/full settlement, and Supabase↔D1 accounting reconciliation/aging
- system capacity, backup/restore evidence, and automated release-readiness gate

## Release status
The codebase is in **web production-readiness / UAT** stage. A successful CI build is necessary but not sufficient for go-live.

Before using real member or financial data:
1. `/readiness` automated technical gates must PASS.
2. Run `docs/production-uat-runbook.md` with synthetic data.
3. Record external D1 and Supabase backups and a successful restore test.
4. Deploy the exact candidate build to Cloudflare and complete the live smoke test.
5. Review remaining Supabase Auth/security production settings.

## Platform target
- Web / desktop teller — current primary release target
- Cloudflare deployment — final live deployment/smoke-test gate
- Mobile PWA — after web UAT is stable
- Android APK via Capacitor — after web/PWA stability
- Supabase Auth
- zero-recurring-cost target during early operation

## Known boundaries
- POS production-certified flow currently uses CASH. QRIS/BANK_TRANSFER provider settlement is not simulated.
- Loan reschedule/restructure, configurable early-settlement interest rebate, and write-off require explicit future policy/workflow rather than editing financial history.
- `91+` day loan aging is an operational NPL proxy, not a regulatory classification.

## Safety
Never commit passwords, OTPs, signing keys, Supabase secret/service-role keys, Cloudflare API tokens, or real member financial data. Use synthetic data until release/UAT gates pass.
