# Cloudflare Production Deployment Runbook

This repository currently has CI only (`.github/workflows/application-ci.yml`). Deployment is intentionally not automatic until production credentials/bindings are explicitly available.

## Candidate commit
Deploy only a `main` commit whose Application CI completed successfully and whose `/readiness` blockers have been resolved in the target environment.

## Pre-deploy
- Confirm Supabase public URL/key environment variables point to the intended `kdkmp-kedungharjo` project.
- Confirm Cloudflare D1 binding `DB` points to the intended operational database.
- Confirm no secret/service-role key is committed to Git.
- Record D1 + Supabase external backups and a PASSED restore test.
- Run `bun install` and `bun run typecheck`.
- Run `bun run build`.

## Cloudflare build/deploy
The repository scripts are:
- preview: `bun run preview`
- deploy: `bun run deploy`

`wrangler.jsonc` expects Worker `kdkmp-kedungharjo`, OpenNext output `.open-next/worker.js`, assets `.open-next/assets`, and D1 binding `DB`.

Do not deploy if the D1 binding cannot be positively identified. A successful build with the wrong database binding is a NO-GO.

## Post-deploy smoke test
- Open the live URL from a fresh/incognito browser.
- Login as SUPER_ADMIN and TELLER dummy users.
- Open Dashboard, `/readiness`, Inventory, POS, Finance, Savings, Loans, and Approvals.
- Run one synthetic CASH sale and verify receipt integrity.
- If safe in the test shift, perform controlled void with a different `POS_VOID` user and verify stock/payment/journal reversal.
- Confirm `/loans/reports` loads and shows no unexplained reconciliation exception.
- Confirm no unexpected 404/500 or authentication redirect loop.

## Go-live
Real data is permitted only after the live smoke test and the manual UAT runbook are signed off. PWA/Android packaging should be based on this stable web release rather than an unverified pre-production build.
