# Cloudflare Production Deployment Runbook

Repository memiliki tiga gate rilis terpisah:
- `.github/workflows/application-ci.yml` — Typecheck, Next.js build, OpenNext worker build, dan Wrangler production-shape dry run.
- `.github/workflows/cloudflare-production-deploy.yml` — deployment production manual dari `main` saja.
- `.github/workflows/production-live-verify.yml` — verifikasi live otomatis setelah deployment berhasil, serta dapat dijalankan manual.

Deployment tidak berjalan otomatis saat merge. Workflow production membutuhkan input konfirmasi `DEPLOY-KDKMP-PRODUCTION` dan GitHub Environment bernama `production`.

## Production settings — hanya 3 secrets

Set hanya tiga secret berikut pada GitHub Environment `production`:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`

Tidak ada GitHub Environment variable lain yang diperlukan untuk deployment awal workers.dev.

Workflow mengunci Supabase ke project `kdkmp-kedungharjo`:
- `https://xhjdqmrehpnvvjktwltl.supabase.co`
- publishable key aktif project sudah menjadi konfigurasi public client pada workflow; service-role/secret key tidak digunakan.

API token Cloudflare harus dapat:
- deploy/read Worker script;
- membaca Workers account subdomain;
- membaca metadata D1 untuk database ID yang diberikan.

## Metadata production diturunkan otomatis

Workflow tidak lagi meminta operator mengetik nama D1 atau URL Worker.

Dengan tiga secret di atas, workflow memanggil Cloudflare API untuk:
1. mengambil metadata database dari `CLOUDFLARE_D1_DATABASE_ID` dan mendapatkan nama D1;
2. mengambil Workers account subdomain;
3. membentuk URL `https://kdkmp-kedungharjo.<workers-subdomain>.workers.dev`;
4. menolak proses bila database ID tidak valid atau subdomain account tidak dapat di-resolve.

`wrangler.jsonc` di repository tetap hanya menyimpan bentuk dasar Worker. Workflow membuat `wrangler.production.json` sementara yang berisi binding:
- `DB`
- `database_name` hasil Cloudflare API
- `database_id` dari secret `CLOUDFLARE_D1_DATABASE_ID`

File production hasil generate tidak dikomit dan dihapus setelah job.

## Candidate commit
Deploy hanya commit `main` yang Application CI-nya hijau. CI juga menjalankan Wrangler dry run setelah OpenNext build agar bentuk deployment Worker tervalidasi sebelum production.

## Workflow sequence
1. Checkout exact `main` commit.
2. Validasi tiga Cloudflare secret.
3. Resolve nama D1 + Workers account subdomain melalui Cloudflare API.
4. Bentuk URL production workers.dev secara otomatis.
5. Install dependencies.
6. Generate Wrangler production config.
7. Typecheck.
8. Next.js build.
9. `opennextjs-cloudflare build --skipNextBuild`.
10. Wrangler production dry run.
11. `opennextjs-cloudflare deploy`.
12. Pastikan Worker memang enabled pada workers.dev.
13. Smoke test `/api/health`, `/login`, dan `/manifest.webmanifest`.
14. `/api/health` harus membuktikan D1 current + Supabase reachable.
15. Hapus generated production files.
16. `Production Live Verification` berjalan otomatis dan mengulang verifikasi dari workflow terpisah.

## Minimal health endpoint
`/api/health` tidak menampilkan identifier database, schema version, key, user, atau data finansial. Endpoint hanya mengembalikan status minimal D1 dan Supabase dan memakai `Cache-Control: no-store`.

Response sehat:
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
Setelah workflow deploy sukses, `.github/workflows/production-live-verify.yml` akan resolve URL workers.dev sendiri dari Account ID/API token lalu:
- memastikan Worker enabled pada workers.dev;
- memastikan `/api/health` PASS;
- membuka root + login + manifest production;
- gagal bila copy lama `PHASE 0`, `AKSES DEVELOPMENT`, atau `Masuk ke Development` masih muncul;
- memvalidasi PWA `display=standalone`, `start_url=/dashboard`, dan icon;
- mencatat hasil PASS ke Issue #42.

Workflow ini juga dapat dijalankan manual dengan input `VERIFY-KDKMP-PRODUCTION`.

## Pre-deploy operational gate
- Pastikan `CLOUDFLARE_D1_DATABASE_ID` adalah database operasional KDKMP Kedungharjo yang benar.
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
Jangan membuat production Capacitor package dengan `server.url`. KDKMP adalah SSR Worker application dan opsi tersebut didokumentasikan untuk live reload, bukan production. Lihat `docs/android-packaging-decision.md`.

## Go-live
Real member/financial data hanya boleh digunakan setelah automated live verification, `/readiness`, authenticated synthetic-data UAT, backup/restore evidence, Auth production-setting review, dan reconciliation checks semuanya lulus.
