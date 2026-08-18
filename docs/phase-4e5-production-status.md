# Phase 4E-5 — Production Verification

Date: 2026-08-18

## Supabase migrations

- `20260818035456 phase_4e5_loan_repayments`
- `20260818035512 phase_4e5_repayment_penalty_boundary`

## Verification

- `loan_repayments`, `loan_repayment_allocations`, dan `loan_repayment_events` tersedia.
- RLS aktif pada ketiga tabel.
- `authenticated` memiliki SELECT, tanpa direct INSERT/UPDATE/DELETE pada `loan_repayments`.
- `anon` tidak memiliki SELECT.
- paid principal/interest/penalty columns tersedia pada `loan_installment_schedule`.
- trigger `loan_repayment_penalty_boundary` aktif.
- permission `LOAN_REPAYMENT_VIEW` dan `LOAN_REPAYMENT_POST` telah dipetakan ke role sesuai desain.
- RPC create/cancel/prepare/complete memakai `SECURITY DEFINER`, `search_path` kosong, executable oleh `authenticated`, dan tidak executable oleh `anon`.
- Performance Advisor tidak menemukan `unindexed_foreign_keys` baru pada tabel Phase 4E-5. Notice `unused_index` pada tabel baru normal karena registry masih kosong.

## Security Advisor

Advisor menandai RPC public `SECURITY DEFINER` yang executable oleh `authenticated`. Pada Phase 4E-5 ini merupakan privileged write boundary yang disengaja: direct table writes dicabut dan setiap RPC melakukan pemeriksaan auth, organization permission, status kontrak/pembayaran, serta stale-allocation/idempotency guards.

Warning `auth_leaked_password_protection` tetap merupakan konfigurasi Auth global dan bukan diperkenalkan Phase 4E-5.

## Data condition at migration

Tidak terdapat kontrak operasional `DISBURSED`/`CLOSED`, sehingga migration tidak membutuhkan backfill repayment aktif.

## Penalty boundary

Produk aktif pada saat verifikasi memiliki late penalty 0. Untuk produk masa depan dengan `late_penalty_bps_per_day > 0`, pembayaran overdue melewati grace period diblok sampai engine penalty selesai. Guard ini mencegah denda terkonfigurasi terhapus secara implisit.

## Application gate

Application CI #108 berhasil pada implementation head sebelum migration: Typecheck dan Next.js production build sukses. Final documentation commit akan menjalankan CI sekali lagi sebelum merge.
