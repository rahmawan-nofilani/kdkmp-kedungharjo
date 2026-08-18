# Cloudflare Production Deployment Runbook

Repository memiliki tiga gate rilis terpisah:
- `.github/workflows/application-ci.yml` — Typecheck, Next.js build, OpenNext worker build, dan Wrangler production-shape dry run.
- `.github/workflows/cloudflare-production-deploy.yml` — deployment production terkontrol dari `main`.
- `.github/workflows/production-live-verify.yml` — verifikasi live otomatis setelah deployment berhasil, serta dapat dijalankan manual.

Deployment tidak berjalan otomatis saat merge.

## Production settings — hanya 2 secrets wajib
Set dua secret berikut pada GitHub Environment `production`:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`

`CLOUDFLARE_ACCOUNT_ID` bersifat **opsional fallback** bila API token tidak dapat melakukan account discovery. Tidak ada GitHub Environment variable lain yang diperlukan untuk deployment awal workers.dev.

Workflow mengunci Supabase ke project `kdkmp-kedungharjo`:
- `https://xhjdqmrehpnvvjktwltl.supabase.co`
- publishable key aktif project sudah menjadi konfigurasi public client pada workflow; service-role/secret key tidak digunakan.

API token Cloudflare harus dapat melihat account yang dapat diakses (atau gunakan Account ID fallback), deploy/read Worker script, membaca Workers account subdomain, dan membaca metadata D1.

## Cara memicu deployment
Ada dua jalur yang ekuivalen dan keduanya selalu checkout `main` terbaru:

### Dari GitHub Actions
Actions → `Cloudflare Production Deploy` → Run workflow → masukkan:
`DEPLOY-KDKMP-PRODUCTION`

### Dari Issue #42
Pemilik repository dapat membuat komentar **persis**:
`DEPLOY-KDKMP-PRODUCTION`

Trigger komentar hanya diterima bila:
- event berasal dari Issue #42;
- isi komentar cocok persis;
- pembuat komentar adalah `github.repository_owner`.

Jalur Issue #42 dibuat agar deployment dapat dipicu melalui connector GitHub tanpa membutuhkan `workflow_dispatch`. Workflow tetap menggunakan GitHub Environment `production` dan dua secret yang sama.

## Metadata production diturunkan otomatis
Dengan dua secret wajib, workflow:
1. mengambil daftar account yang dapat diakses token;
2. menguji `CLOUDFLARE_D1_DATABASE_ID` pada account-account tersebut;
3. menerima tepat satu account yang benar-benar memiliki D1 ID tersebut;
4. mengambil nama D1;
5. mengambil Workers account subdomain;
6. membentuk URL `https://kdkmp-kedungharjo.<workers-subdomain>.workers.dev`;
7. menolak proses bila D1 ID tidak dapat diidentifikasi secara unik.

Jika account discovery tidak tersedia, tambahkan `CLOUDFLARE_ACCOUNT_ID`; workflow tetap memvalidasi kepemilikan D1 sebelum deploy.

`wrangler.jsonc` hanya menyimpan bentuk dasar Worker. Workflow membuat `wrangler.production.json` sementara dengan binding `DB`, nama D1 hasil Cloudflare API, dan database ID explicit. File sementara tidak dikomit.

## Release sequence
1. Trigger deployment dari Actions atau komentar owner di Issue #42.
2. Checkout exact `main` dan catat `RELEASE_SHA`.
3. Validasi API token + D1 ID.
4. Resolve Account ID, D1 name, Workers subdomain, dan production URL.
5. Install dependencies.
6. Generate Wrangler production config.
7. Typecheck.
8. Next.js build.
9. OpenNext build.
10. Wrangler production dry run.
11. Deploy Worker.
12. Pastikan Worker enabled pada workers.dev.
13. Smoke `/api/health`, `/login`, dan `/manifest.webmanifest`.
14. `Production Live Verification` berjalan otomatis dari workflow terpisah.

## Minimal health endpoint
`/api/health` tidak menampilkan identifier database, schema version, key, user, atau data finansial. Endpoint hanya mengembalikan status minimal D1 dan Supabase dengan `Cache-Control: no-store`.

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
Setelah deploy sukses, workflow live verification akan:
- resolve Account ID + URL workers.dev sendiri;
- memastikan Worker enabled;
- memastikan `/api/health` PASS;
- membuka root + login + manifest;
- gagal bila copy lama `PHASE 0`, `AKSES DEVELOPMENT`, atau `Masuk ke Development` muncul;
- memvalidasi PWA `display=standalone`, `start_url=/dashboard`, dan icon;
- mencatat hasil PASS ke Issue #42.

## Pre-deploy operational gate
- Pastikan `CLOUDFLARE_D1_DATABASE_ID` adalah database operasional KDKMP Kedungharjo yang benar.
- Record external backup D1 + Supabase.
- Record restore test PASSED.
- Gunakan synthetic/UAT data sampai seluruh gate selesai.

## Post-deploy authenticated UAT
Automated verification tidak memiliki kredensial user dan tidak membuat transaksi finansial. Setelah deployment berhasil:
- login sebagai SUPER_ADMIN dummy dan TELLER dummy;
- buka Dashboard, `/readiness`, Inventory, POS, Finance, Savings, Loans, dan Approvals;
- jalankan synthetic CASH sale dan controlled void oleh user berbeda dengan `POS_VOID`;
- verifikasi stock/payment/journal reversal;
- verifikasi `/loans/reports` tanpa unexplained reconciliation exception;
- install PWA dari HTTPS URL dan verifikasi launch/login/logout.

## Android boundary
Jangan membuat production Capacitor package dengan `server.url`. KDKMP adalah SSR Worker application; lihat `docs/android-packaging-decision.md`.

## Go-live
Data anggota/finansial nyata hanya boleh digunakan setelah automated live verification, `/readiness`, authenticated synthetic-data UAT, backup/restore evidence, Auth production-setting review, dan reconciliation checks semuanya lulus.
