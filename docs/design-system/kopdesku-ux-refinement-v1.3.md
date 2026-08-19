# KopdesKu UX Refinement & Navigation Pack v1.3

Status: **IMPLEMENTATION IN PROGRESS**

Foundation: `KopdesKu Integration Pack v1.2`.

## Non-negotiable inheritance

Do not change:

- approved KopdesKu logo geometry or redraw the master mark;
- canonical brand colors established by v1.2;
- favicon/PWA/app identity assets;
- route contracts unless a presentation-only entry route is additive;
- Supabase/D1 schemas;
- server actions and transaction posting;
- maker-checker, idempotency, RBAC, accounting, inventory, procurement, savings, or loan business rules.

v1.3 changes **how users reach and read a workflow**, not the transaction engine itself.

## UX goals

1. Professional and elegant rather than decorative.
2. Easy to use for daily cooperative operations.
3. Task-first navigation instead of developer/system-first navigation.
4. Compact but readable typography.
5. Mobile-first access with minimum 44px touch targets.
6. Progressive disclosure: primary action first, advanced detail behind a deliberate click.
7. Dense financial tables on desktop, readable cards/lists on mobile where practical.

## Typography / density

Desktop target:

- Page title: 24px.
- Section: 18px.
- Card title: 15px.
- Body: 13.5–14px.
- Label: 12.5–13px.
- Financial primary: 22px.
- Operational control: 44px; compact 38px.
- Comfortable row: 46px; compact row: 40px.

Mobile target:

- Page title: 21px.
- Section: 17px.
- Body: 14px.
- Financial primary: 20px.
- Text inputs remain 16px where required to avoid mobile browser auto-zoom.
- Touch target remains >=44px.

## Navigation architecture

### Desktop

Primary sidebar shows domains, not every route at once:

- Beranda
- Kasir & Penjualan
- Simpan Pinjam
- Operasional
- Keuangan
- Persetujuan
- Laporan
- Sistem

Expandable modules reveal permission-filtered child actions.

### Simpan Pinjam hierarchy

- Beranda Simpan Pinjam
- Simpanan
  - Rekening Anggota
  - Setoran Masuk
  - Penarikan
  - Riwayat Simpanan
- Pinjaman
  - Pengajuan Pinjaman
  - Kontrak & Jadwal
  - Pencairan
  - Angsuran Masuk
  - Denda & Keringanan
  - Pelunasan / Koreksi
- Laporan
  - Laporan Pinjaman
- Pengaturan
  - Produk Simpanan
  - Produk Pinjaman

Configuration routes are intentionally separated from daily transactions.

### Mobile bottom navigation

- Beranda
- Transaksi
- Simpan Pinjam
- Laporan
- Menu

`Transaksi` opens a role-aware launcher instead of silently routing different roles to unrelated pages.

Launcher candidates, permission-filtered:

- POS / Penjualan
- Setoran Simpanan
- Penarikan Simpanan
- Angsuran Pinjaman
- Ajukan Pinjaman
- Pembelian / Penerimaan

## Simpan Pinjam hub

New additive presentation route: `/simpan-pinjam`.

Purpose:

- give daily operators one simple starting point;
- show concise operational counts;
- expose frequent actions immediately;
- keep product configuration and deep reports secondary;
- preserve all existing Savings and Loan routes/actions underneath.

## Savings focused transaction pattern

`/savings/accounts?intent=deposit` and `?intent=withdraw` turn the account registry into a clear account-selection step. The selected account opens the existing ledger page with the requested mode.

Account detail uses three explicit tasks:

- Setor
- Tarik
- Riwayat

Only the selected transaction form is shown. Desktop keeps detailed ledger tables; mobile uses compact history cards to avoid forcing an ~1000px financial table into a phone viewport.

## Acceptance gates

Before merge/deploy:

- Typecheck PASS.
- Next.js production build PASS.
- OpenNext Cloudflare build PASS.
- Wrangler production-shape dry run PASS.
- No unexpected RBAC visibility regressions.
- Existing transaction actions remain unchanged.
- Mobile navigation and drawers work at 390x844 and comparable widths.
- Logo and canonical brand colors unchanged from v1.2.
- Final authenticated smoke must cover Dashboard, Simpan Pinjam hub, Setoran intent, Penarikan intent, Loans, Finance, Approvals, and logout.
