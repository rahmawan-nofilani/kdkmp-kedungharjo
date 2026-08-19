# KopdesKu UX Refinement & Navigation Pack v1.3

Status: **IMPLEMENTATION COMPLETE · RELEASE QA PENDING**

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
4. Compact, calm typography with less visual weight.
5. Mobile-first access with minimum 44px touch targets.
6. Progressive disclosure: primary action first, advanced detail behind a deliberate click.
7. Dense financial tables on desktop, readable cards/lists on mobile where practical.
8. Avoid page-level horizontal scrolling on a 390px phone viewport; internal table scrollers remain allowed only where a financial table must stay tabular.

## Typography / density — canonical v1.3

Desktop:

- Display: 30px / 600.
- Page title: 22px / 500.
- Section: 16px / 500.
- Card title: 14px / 500.
- Body: 13px / 400.
- Label: 12px / 500.
- Caption: 11px / 400.
- Financial primary: 20px / 600.
- Operational control: 42px; compact 36px.
- Comfortable row: 44px; compact row: 38px.

Mobile:

- Display: 24px / 600.
- Page title: 19px / 500.
- Section: 15px / 500.
- Card title: 13.5px / 500.
- Body: 13.5px / 400.
- Label: 12.5px / 500.
- Financial primary: 18px / 600.
- Text inputs/selects/textarea remain 16px to avoid mobile browser auto-zoom.
- Interactive touch targets remain at least 44px.

The objective is not to make everything small. Primary financial values remain visually distinct, while headings, labels, navigation, explanatory copy, and configuration screens no longer compete for attention through excessive size or 800/900 font weights.

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

Expandable modules reveal permission-filtered child actions. Sidebar labels use a calmer 400–500 weight.

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

`Menu` is domain-first: the user first chooses Kasir & Penjualan, Simpan Pinjam, Operasional, Keuangan, Persetujuan, Laporan, or Sistem; child routes are revealed only after that domain is opened. This avoids dumping dozens of links into one phone drawer.

## Simpan Pinjam hub

New additive presentation route: `/simpan-pinjam`.

Purpose:

- give daily operators one simple starting point;
- show concise operational counts;
- expose frequent actions immediately;
- keep product configuration and deep reports secondary;
- preserve all existing Savings and Loan routes/actions underneath.

## Mobile task patterns

### Savings

`/savings/accounts?intent=deposit` and `?intent=withdraw` turn the account registry into a clear account-selection step. The selected account opens the existing ledger page with the requested mode.

Account detail uses three explicit tasks:

- Setor
- Tarik
- Riwayat

Only the selected transaction form is shown. Desktop keeps detailed ledger tables; mobile uses compact account/history cards.

### POS

The existing POS transaction engine is unchanged. At <=900px the UI exposes two clear modes:

- Produk
- Keranjang

The user no longer has to scroll through a long catalog before reaching checkout. Cart, stock limits, member selection, cash-sale action, receipt, and idempotency remain unchanged.

### Members / reports / loan repayment

- Members: desktop table, mobile member cards.
- Daily Sales: desktop transaction table, mobile sale cards.
- Loan Angsuran: desktop table, mobile payment cards.
- Contract registry remains accessible on mobile; only the repayment table is replaced by payment cards.

## Screen-family refinement completed

Presentation density has been normalized across:

- AppShell / desktop hierarchy / mobile drawers;
- Dashboard;
- POS;
- Teller;
- Members;
- Inventory;
- Procurement;
- Finance overview;
- Treasury;
- Journals;
- Assets;
- Closing Readiness;
- Approval Center;
- Savings accounts, ledger, products and reports;
- Loan products, applications, contracts and repayments;
- Daily Sales report.

Global v1.3 adapter rules also normalize remaining authenticated workspaces without changing their server actions.

## Release QA gate

Before merge/deploy:

- Typecheck PASS on the final head.
- Next.js production build PASS on the final head.
- OpenNext Cloudflare build PASS on the final head.
- Wrangler production-shape dry run PASS on the final head.
- No unexpected RBAC visibility regressions.
- Existing transaction actions remain unchanged.
- Logo and canonical brand colors remain unchanged from v1.2.
- Final authenticated mobile smoke runs at 390x844 and verifies no page-level horizontal overflow on certified routes.
- Smoke verifies mobile bottom navigation, role-aware Transaksi launcher, domain-first Menu, Simpan Pinjam hierarchy, POS Produk↔Keranjang, authenticated route loading, and logout/session protection.

There is no separate preview Worker/D1 environment declared in the repository. Do not point an ad-hoc preview at production D1 merely for visual QA. Production deployment remains gated until the PR final head is CI-green and release QA is ready.
