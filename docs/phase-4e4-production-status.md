# Phase 4E-4 — Production Status

Tanggal verifikasi: 2026-08-18 (Asia/Jakarta)

## Supabase production

Phase 4E-4 diterapkan ke project `kdkmp-kedungharjo` melalui migration resmi:

- `20260818033210 phase_4e4_loan_disbursement`
- `20260818033316 phase_4e4_loan_disbursement_fk_index`

Post-migration verification:

- `loan_disbursements` tersedia dan RLS aktif.
- `loan_disbursement_events` tersedia dan RLS aktif.
- `authenticated` hanya memiliki direct `SELECT` ke tabel pencairan; direct `INSERT`, `UPDATE`, dan `DELETE` tidak diberikan.
- `anon` tidak memiliki direct `SELECT` dan tidak dapat mengeksekusi RPC pencairan.
- Permission aktif: `LOAN_DISBURSEMENT_VIEW`, `LOAN_DISBURSEMENT_MANAGE`, `LOAN_DISBURSEMENT_APPROVE`, `LOAN_DISBURSEMENT_EXECUTE`.
- Role mapping telah diverifikasi untuk SUPER_ADMIN, MANAGER, PENGURUS, PENGAWAS, ADMIN_UNIT, dan TELLER sesuai segregation of duties fase ini.
- Keenam RPC workflow menggunakan `SECURITY DEFINER` dengan `search_path` kosong dan hanya diekspos ke `authenticated`.
- Tabel pencairan masih kosong saat migration/verifikasi; tidak ada data pinjaman aktif yang dimutasi.

## Security Advisor

Supabase Security Advisor melaporkan `authenticated_security_definer_function_executable` pada RPC pencairan. Warning ini intentional: RPC menjadi privileged write boundary karena direct table writes dicabut. Setiap operasi sensitif tetap memeriksa permission organisasi, status workflow, dan maker-checker sesuai fungsinya. `anon` tidak memiliki EXECUTE.

Warning `auth_leaked_password_protection` adalah konfigurasi Auth global yang sudah ada dan bukan diperkenalkan oleh Phase 4E-4.

Referensi advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Performance Advisor

Pemeriksaan awal menemukan FK `loan_disbursements.member_id` belum memiliki covering index langsung. Migration hardening `phase_4e4_loan_disbursement_fk_index` menambahkan `loan_disbursements_member_fk_idx`.

Setelah hardening, tidak ada lagi `unindexed_foreign_keys` yang berasal dari tabel Phase 4E-4. `unused_index` pada index baru wajar karena registry pencairan masih kosong.

Referensi advisor: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## GitHub Actions

Application CI #97 pada implementasi Phase 4E-4 berhasil:

- Typecheck: success
- Next.js production build: success

Commit dokumentasi production ini akan memicu CI final tambahan sebelum PR di-merge.

## Cross-database execution boundary

Supabase menyimpan state workflow pencairan, sedangkan D1 menyimpan journal kas/bank. Ini bukan distributed transaction atomik; implementasi memakai saga/retry idempotent:

1. Supabase `APPROVED → PROCESSING` dan mengunci referensi eksekusi.
2. D1 memposting journal dengan deterministic idempotency key `loan-disbursement:<disbursement_id>`.
3. Supabase memfinalisasi `PROCESSING → DISBURSED` dan kontrak `READY → DISBURSED` setelah D1 journal ID tersedia.

Jika langkah 3 gagal setelah D1 berhasil, retry dengan referensi yang sama tidak membuat journal kedua.

## D1 accounting

Saat eksekusi pencairan:

- debit: `1-1200 Piutang Pinjaman Anggota`
- kredit: akun COA treasury CASH/BANK yang dipilih
- D1 menolak pencairan bila treasury tidak aktif, tipe treasury tidak cocok dengan kanal, saldo sumber tidak cukup, atau accounting period sudah CLOSED/LOCKED.

Phase 4E-4 tidak memakai saldo simpanan anggota sebagai sumber pencairan.

## Batas fase

Belum termasuk:

- penerimaan angsuran,
- alokasi pokok/bunga/denda,
- waiver/pelunasan,
- reconciliation pinjaman end-to-end,
- deployment aplikasi.
