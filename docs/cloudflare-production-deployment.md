# Cloudflare Production Deployment Runbook

Repository sekarang memiliki dua gate terpisah:
- `.github/workflows/application-ci.yml` — Typecheck, Next.js build, dan Cloudflare OpenNext worker build.
- `.github/workflows/cloudflare-production-deploy.yml` — deployment production manual dari `main` saja.

Deployment tidak berjalan otomatis saat merge. Workflow production membutuhkan input konfirmasi `DEPLOY-KDKMP-PRODUCTION` dan GitHub Environment bernama `production`.

## Production settings

Set pada GitHub Environment `production` sebelum menjalankan workflow.

### Secrets
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`

### Variables
- `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_PRODUCTION_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Supabase URL dikunci oleh workflow ke project `kdkmp-kedungharjo`:
- `https://xhjdqmrehpnvvjktwltl.supabase.co`

Gunakan hanya publishable key aktif milik project tersebut. Jangan pernah memakai service-role/secret key sebagai `NEXT_PUBLIC_*`.

## D1 guardrail

`wrangler.jsonc` di repository hanya menyimpan bentuk dasar Worker. Workflow production membuat `wrangler.production.json` secara sementara dan menambahkan:
- binding `DB`
- `database_name` dari `CLOUDFLARE_D1_DATABASE_NAME`
- `database_id` dari `CLOUDFLARE_D1_DATABASE_ID`

File production hasil generate tidak dikomit dan dihapus pada akhir job. Hal ini mencegah kita menebak ID D1 serta membuat target production eksplisit.

## Candidate commit
Deploy hanya commit `main` yang Application CI-nya hijau dan `/readiness` pada target environment tidak memiliki blocker teknis yang belum ditangani.

## Workflow sequence
1. Checkout exact `main` commit.
2. Validasi seluruh production settings wajib tersedia.
3. Install dependencies.
4. Generate Wrangler production config.
5. Typecheck.
6. Next.js build.
7. `opennextjs-cloudflare build --skipNextBuild` untuk target Workers.
8. `opennextjs-cloudflare deploy` ke Cloudflare.
9. Smoke-test publik `/login` dan `/manifest.webmanifest` pada `CLOUDFLARE_PRODUCTION_URL`.
10. Hapus generated production config.

## Pre-deploy operational gate
- Confirm D1 database adalah database operasional KDKMP Kedungharjo yang benar.
- Record external backup D1 + Supabase.
- Record restore test PASSED.
- Gunakan synthetic/UAT data sampai seluruh gate selesai.
- Jangan deploy jika D1 database tidak bisa diidentifikasi positif.

## Post-deploy authenticated smoke test
Public workflow smoke test tidak memiliki kredensial user. Setelah deployment berhasil:
- buka URL live dari browser/incognito;
- login sebagai SUPER_ADMIN dummy dan TELLER dummy;
- buka Dashboard, `/readiness`, Inventory, POS, Finance, Savings, Loans, dan Approvals;
- jalankan satu synthetic CASH sale dan periksa receipt integrity;
- bila aman, controlled void oleh user berbeda yang mempunyai `POS_VOID`;
- verifikasi stock/payment/journal reversal;
- verifikasi `/loans/reports` tidak memiliki unexplained reconciliation exception;
- pastikan tidak ada redirect loop, 404, atau 500;
- install PWA dari HTTPS URL dan verifikasi launch/login/logout.

## Go-live
Real member/financial data hanya boleh digunakan setelah live smoke test dan `docs/production-uat-runbook.md` ditandatangani/diterima secara operasional. Android APK/Capacitor dibuat dari URL web production yang sudah lulus gate tersebut.
