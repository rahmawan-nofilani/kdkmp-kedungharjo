# Phase 4E-5 — Penerimaan Angsuran Pinjaman

## Tujuan

Mengaktifkan pembayaran pokok + bunga untuk kontrak `DISBURSED` tanpa membuka direct write ke tabel operasional dan tanpa risiko double posting lintas Supabase ↔ D1.

## Source of truth

- **Supabase**: kontrak, jadwal, repayment registry, allocation snapshot, payment status, audit trail.
- **D1**: Kas/Bank dan journal accounting aktual.
- Koordinasi lintas database menggunakan **retryable idempotent saga**, bukan distributed transaction atomik.

## Allocation policy core

1. Kontrak harus `DISBURSED`.
2. Satu repayment `DRAFT/PROCESSING` maksimum per kontrak.
3. Nominal tidak boleh melebihi sisa pokok + bunga.
4. Alokasi deterministik: **bunga terlebih dahulu, kemudian pokok, periode tertua terlebih dahulu**.
5. Partial payment diperbolehkan.
6. Allocation snapshot dibekukan saat draft dibuat.
7. Jadwal baru diperbarui setelah D1 journal berhasil.
8. Jika response terputus setelah D1 berhasil, retry memakai idempotency key `loan-repayment:<repayment_id>` dan tidak membuat journal kedua.
9. Ketika seluruh pokok + bunga jadwal sudah terbayar, kontrak berpindah `DISBURSED → CLOSED`.

## D1 accounting core

- Debit Kas/Bank sebesar total pembayaran.
- Kredit `1-1200 Piutang Pinjaman Anggota` sebesar alokasi pokok.
- Kredit `4-1100 Pendapatan Bunga Pinjaman` sebesar alokasi bunga.
- Kredit `4-1200 Pendapatan Denda Pinjaman` disiapkan untuk fase penalty; nilai core 4E-5 masih `0`.

## Kanal

Kanal harus diizinkan oleh `product_snapshot.repayment_channels`:

- `CASH` → treasury `CASH`
- `BANK_TRANSFER` → treasury `BANK`
- `QRIS` → treasury `BANK`

## Belum termasuk

- accrual denda keterlambatan dan grace period
- waiver denda
- reversal/koreksi repayment posted
- reschedule/restrukturisasi
- special settlement/write-off
- unified loan accounting mapping & loan-vs-D1 reconciliation report

Fitur-fitur tersebut harus ditangani sebagai transaksi/audit baru, bukan dengan mengedit nominal kontrak atau schedule historis.
