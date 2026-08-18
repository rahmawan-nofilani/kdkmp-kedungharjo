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
- installable PWA metadata/icon for the HTTPS web release, without unsafe offline financial caching
- production `/api/health` for minimal D1 + Supabase deployment smoke verification

## Release status
The codebase is in **final web go-live / UAT** stage. CI validates TypeScript, Next.js, OpenNext Cloudflare output, and Wrangler production-shape dry run. A successful build is necessary but not sufficient for real-data go-live.

Before using real member or financial data:
1. Deploy the exact `main` candidate with the guarded `Cloudflare Production Deploy` workflow.
2. Public `/api/health`, `/login`, and `/manifest.webmanifest` smoke checks must PASS.
3. `/readiness` automated technical gates must PASS.
4. Run `docs/production-uat-runbook.md` with synthetic data.
5. Record external D1 and Supabase backups and a successful restore test.
6. Review remaining Supabase Auth/security production settings.

## Platform target
- Web / desktop teller — primary operational release target
- Cloudflare deployment — guarded manual production workflow is implemented; credentials/environment remain external
- Mobile PWA installability — implemented; final verification requires the HTTPS production URL
- Android native package — separate post-go-live track; see `docs/android-packaging-decision.md`
- Supabase Auth
- zero-recurring-cost target during early operation

## Known boundaries
- POS production-certified flow currently uses CASH. QRIS/BANK_TRANSFER provider settlement is not simulated.
- Loan reschedule/restructure, configurable early-settlement interest rebate, and write-off require explicit future policy/workflow rather than editing financial history.
- `91+` day loan aging is an operational NPL proxy, not a regulatory classification.
- PWA installability does not mean offline financial transactions are supported.
- A Capacitor `server.url` wrapper is deliberately not used for production Android because the official Capacitor configuration documents that option for live reload, not production.

## Safety
Never commit passwords, OTPs, signing keys, Supabase secret/service-role keys, Cloudflare API tokens, or real member financial data. Use synthetic data until release/UAT gates pass.
