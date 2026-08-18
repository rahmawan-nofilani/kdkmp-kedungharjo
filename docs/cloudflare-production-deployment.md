# Cloudflare Production Deployment Runbook

Repository memiliki tiga gate rilis terpisah:
- `.github/workflows/application-ci.yml` — Typecheck, Next.js build, OpenNext worker build, dan Wrangler production-shape dry run.
- `.github/workflows/cloudflare-production-deploy.yml` — deployment production manual dari `main` saja.
- `.github/workflows/production-live-verify.yml` — verifikasi live otomatis setelah deployment berhasil, serta dapat dijalankan manual.

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
Deploy hanya commit `main` yang Application CI-nya hijau. CI sekarang juga menjalankan Wrangler dry run setelah OpenNext build agar bentuk deployment Worker tervalidasi sebelum production.

## Workflow sequence
1. Checkout exact `main` commit.
2. Validasi seluruh production settings wajib tersedia dan URL production harus HTTPS.
3. Install dependencies.
4. Generate Wrangler production config.
5. Typecheck.
6. Next.js build.
7. `opennextjs-cloudflare build --skipNextBuild` untuk target Workers.
8. Wrangler production dry run.
9. `opennextjs-cloudflare deploy` ke Cloudflare.
10. Smoke test `/api/health`, `/login`, dan `/manifest.webmanifest`.
11. `/api/health` harus membuktikan D1 current + Supabase reachable.
12. Hapus generated production config.
13. `Production Live Verification` berjalan otomatis dan mengulang verifikasi dari workflow terpisah.

## Minimal health endpoint
`/api/health` tidak menampilkan identifier database, schema version, key, user, atau data finansial. Endpoint hanya mengembalikan status minimal D1 dan Supabase dan memakai `Cache-Control: no-store`.

Response sehat berbentuk:
```json
{
  "status": "ok",
  "checks": {
    "d1": "ok",
    "supabase": "ok"
  }
}
```

Jika salah satu dependency tidak sehat, endpoint mengembalikan HTTP 503.

## Automatic post-deploy verification
Setelah workflow deploy sukses, `.github/workflows/production-live-verify.yml` akan:
- memastikan `/api/health` tetap PASS dari job terpisah;
- membuka root + login + manifest production;
- gagal bila copy lama `PHASE 0`, `AKSES DEVELOPMENT`, atau `Masuk ke Development` masih muncul;
- memvalidasi PWA `display=standalone`, `start_url=/dashboard`, dan icon;
- mencatat hasil PASS ke Issue #42.

Workflow ini juga dapat dijalankan manual dengan input `VERIFY-KDKMP-PRODUCTION`.

## Pre-deploy operational gate
- Confirm D1 database adalah database operasional KDKMP Kedungharjo yang benar.
- Record external backup D1 + Supabase.
- Record restore test PASSED.
- Gunakan synthetic/UAT data sampai seluruh gate selesai.
- Jangan deploy jika D1 database tidak bisa diidentifikasi positif.

## Post-deploy authenticated UAT
Automated live verification tidak memiliki kredensial user dan tidak membuat transaksi finansial. Setelah deployment berhasil:
- buka URL live dari browser/incognito;
- login sebagai SUPER_ADMIN dummy dan TELLER dummy;
- buka Dashboard, `/readiness`, Inventory, POS, Finance, Savings, Loans, dan Approvals;
- jalankan satu synthetic CASH sale dan periksa receipt integrity;
- bila aman, controlled void oleh user berbeda yang mempunyai `POS_VOID`;
- verifikasi stock/payment/journal reversal;
- verifikasi `/loans/reports` tidak memiliki unexplained reconciliation exception;
- pastikan tidak ada redirect loop, 404, atau 500;
- install PWA dari HTTPS URL dan verifikasi launch/login/logout.

## Android boundary
Jangan membuat production Capacitor package dengan `server.url`. KDKMP adalah SSR Worker application dan opsi Capacitor tersebut didokumentasikan untuk live reload, bukan production. Lihat `docs/android-packaging-decision.md`.

## Go-live
Real member/financial data hanya boleh digunakan setelah automated live verification, `/readiness`, authenticated synthetic-data UAT, backup/restore evidence, dan reconciliation checks semuanya lulus.
