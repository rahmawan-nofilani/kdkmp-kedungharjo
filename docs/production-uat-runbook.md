# Production UAT Runbook — KDKMP Kedungharjo

## Gate sebelum mulai
1. `/readiness` harus lulus semua automated technical gates.
2. Gunakan akun dan data sintetis / dummy. Jangan memakai data finansial anggota nyata.
3. Simpan backup eksternal D1 dan Supabase, lalu lakukan restore ke environment uji dan catat hasil PASSED.
4. UAT dilakukan pada build/commit yang sama dengan kandidat deployment.

## Role & access
Uji minimal SUPER_ADMIN, MANAGER, ADMIN_UNIT, TELLER, PENGURUS, dan PENGAWAS.
- Pastikan menu yang tidak berhak tidak tampil.
- Pastikan maker tidak dapat melakukan approval/checker pada transaksi yang memang menerapkan segregation of duties.
- Pastikan logout/login ulang dan session recovery bekerja.

## Member master
- Buat anggota dummy.
- Ubah data non-finansial yang diizinkan.
- Pastikan role view-only tidak dapat melakukan mutation.
- Periksa audit/event history.

## Inventory & procurement
- Siapkan produk dummy dan opening stock.
- Buat purchase/order sesuai flow yang tersedia.
- Terima barang dan pastikan inventory movement cocok.
- Jalankan supplier invoice/AP dan pembayaran sesuai role maker-checker.
- Pastikan jurnal procurement dan saldo supplier konsisten.

## Teller & POS CASH
- TELLER membuka shift dengan kas awal dummy.
- Lakukan penjualan CASH dengan produk tracked stock.
- Buka receipt; seluruh Transaction Integrity harus PASS.
- Pastikan stok berkurang dan journal SALE balance.
- Dengan user berbeda yang memiliki `POS_VOID`, void transaksi saat shift asal masih OPEN.
- Pastikan payment menjadi REVERSED, sale menjadi VOIDED/REFUNDED, stok kembali, journal SALE_VOID membalik journal asal, dan audit tercatat.
- Coba teller asal melakukan void sendiri: harus diblok.
- Tutup shift; reconciliation harus nol exception dan expected cash harus sesuai.

## Savings
- Buat/submit/approve produk simpanan dummy dengan maker-checker.
- Buka rekening simpanan dummy dan approve sesuai role.
- Lakukan deposit dan withdrawal dummy.
- Pastikan D1 savings ledger/journal dan laporan integritas konsisten.
- Pastikan transaksi yang melanggar status/permission diblok.

## Loan end-to-end
- Buat/submit/approve produk pinjaman dummy.
- Buat application dan jalankan eligibility.
- Checker approve application.
- Buat contract dan schedule; pastikan snapshot produk immutable.
- Buat/submit/approve/execute disbursement dummy.
- Pastikan journal D1 pencairan dan receivable cocok.
- Lakukan partial repayment lalu full repayment/settlement.
- Untuk skenario overdue, gunakan data uji terkontrol untuk menguji assessment penalty dan grace period.
- Ajukan waiver; maker tidak boleh approve waiver sendiri.
- Uji repayment reversal dengan checker berbeda dan pastikan journal reversal + schedule restore cocok.
- Buka `/loans/reports`; reconciliation exceptions dan control totals harus sesuai state yang disengaja.

## Finance & closing
- Periksa Kas & Bank, journal registry, dan accounting mappings.
- Pastikan draft/submitted journal yang belum selesai muncul sebagai blocker closing bila relevan.
- Jalankan `/finance/closing-readiness` pada periode uji.
- Jangan LOCK periode nyata hanya untuk UAT.

## Backup & recovery
- Buat backup eksternal D1.
- Buat backup/export Supabase sesuai prosedur yang tersedia.
- Restore kedua sumber ke environment/sandbox uji.
- Verifikasi sampel member, transaksi, inventory, journal, savings, dan loan state.
- Catat restore sebagai PASSED di `/capacity/recovery` hanya bila benar-benar berhasil.

## Deployment smoke test
Setelah deployment Cloudflare yang sebenarnya:
- Buka URL live dari browser/incognito baru.
- Login sebagai minimal SUPER_ADMIN dan TELLER.
- Verifikasi Dashboard, POS, Inventory, Finance, Savings, Loans, Approvals, Readiness.
- Lakukan satu transaksi dummy kecil end-to-end dan reversal/cleanup yang sesuai.
- Cek console/network error dan halaman 404/500.
- Verifikasi environment variables dan D1 binding menunjuk environment yang dimaksud.

## Release decision
**GO** hanya jika:
- Application CI hijau pada commit kandidat.
- `/readiness` semua automated gate PASS.
- UAT di atas selesai tanpa blocker severity tinggi.
- Backup D1 + Supabase tersedia dan restore PASSED.
- Deployment live smoke test PASS.
- Supabase Auth leaked-password protection diputuskan/diaktifkan sesuai kebijakan production.

Jika salah satu gagal, status adalah **NO-GO** sampai penyebab diperbaiki dan test terkait diulang.
