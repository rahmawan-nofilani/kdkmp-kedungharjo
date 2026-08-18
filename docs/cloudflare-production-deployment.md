# Cloudflare Production Deployment Runbook

Repository memiliki tiga gate rilis terpisah:
- `.github/workflows/application-ci.yml` — Typecheck, Next.js build, OpenNext worker build, dan Wrangler production-shape dry run.
- `.github/workflows/cloudflare-production-deploy.yml` — deployment production manual dari `main` saja.
- `.github/workflows/production-live-verify.yml` — verifikasi live otomatis setelah deployment berhasil, serta dapat dijalankan manual.

Deployment tidak berjalan otomatis saat merge. Workflow production membutuhkan input konfirmasi `DEPLOY-KDKMP-PRODUCTION` dan GitHub Environment bernama `production`.

## Production settings — hanya 2 secrets wajib

Set dua secret berikut pada GitHub Environment `production`:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`

`CLOUDFLARE_ACCOUNT_ID` bersifat **opsional fallback**, bukan lagi wajib. Gunakan hanya bila API token yang dipilih tidak dapat melakukan account discovery.

Tidak ada GitHub Environment variable lain yang diperlukan untuk deployment awal workers.dev.

Workflow mengunci Supabase ke project `kdkmp-kedungharjo`:
- `https://xhjdqmrehpnvvjktwltl.supabase.co`
- publishable key aktif project sudah menjadi konfigurasi public client pada workflow; service-role/secret key tidak digunakan.

API token Cloudflare harus dapat:
- melihat account yang dapat diakses, atau gunakan fallback `CLOUDFLARE_ACCOUNT_ID`;
- deploy/read Worker script;
- membaca Workers account subdomain;
- membaca metadata D1 untuk database ID yang diberikan.

## Metadata production diturunkan otomatis

Workflow tidak meminta operator mengetik Account ID, nama D1, atau URL Worker.

Dengan dua secret wajib di atas, workflow:
1. mengambil daftar account yang dapat diakses token;
2. menguji `CLOUDFLARE_D1_DATABASE_ID` pada account-account tersebut;
3. menerima tepat satu account yang benar-benar memiliki D1 ID tersebut;
4. mengambil nama D1 dari metadata database;
5. mengambil Workers account subdomain;
6. membentuk URL `https://kdkmp-kedungharjo.<workers-subdomain>.workers.dev`;
7. menolak proses bila D1 ID tidak dapat diidentifikasi secara unik.

Jika account discovery tidak tersedia untuk token yang digunakan, tambahkan `CLOUDFLARE_ACCOUNT_ID` sebagai secret opsional. Workflow tetap memvalidasi bahwa Account ID tersebut benar-benar memiliki `CLOUDFLARE_D1_DATABASE_ID` sebelum deploy.

`wrangler.jsonc` di repository tetap hanya menyimpan bentuk dasar Worker. Workflow membuat `wrangler.production.json` sementara yang berisi binding:
- `DB`
- `database_name` hasil Cloudflare API
- `database_id` dari `CLOUDFLARE_D1_DATABASE_ID`

File production hasil generate tidak dikomit dan dihapus setelah job.

## Candidate commit
Deploy hanya commit `main` yang Application CI-nya hijau. CI juga menjalankan Wrangler dry run setelah OpenNext build agar bentuk deployment Worker tervalidasi sebelum production.

## Workflow sequence
1. Checkout exact `main` commit.
2. Validasi API token + D1 database ID.
3. Resolve Account ID dari kepemilikan D1; gunakan optional Account ID hanya sebagai fallback.
4. Resolve nama D1 + Workers account subdomain melalui Cloudflare API.
5. Bentuk URL production workers.dev secara otomatis.
6. Install dependencies.
7. Generate Wrangler production config.
8. Typecheck.
9. Next.js build.
10. `opennextjs-cloudflare build --skipNextBuild`.
11. Wrangler production dry run.
12. `opennextjs-cloudflare deploy`.
13. Pastikan Worker memang enabled pada workers.dev.
14. Smoke test `/api/health`, `/login`, dan `/manifest.webmanifest`.
15. `/api/health` harus membuktikan D1 current + Supabase reachable.
16. Hapus generated production files.
17. `Production Live Verification` berjalan otomatis dan mengulang verifikasi dari workflow terpisah.

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
Setelah workflow deploy sukses, `.github/workflows/production-live-verify.yml` akan resolve Account ID + URL workers.dev sendiri dari API token dan D1 Database ID lalu:
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
