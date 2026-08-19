# KopdesKu UX Foundation v1.4

Status: IMPLEMENTATION BASELINE

## Purpose

KopdesKu v1.4 is an operational UX stabilization layer on top of the existing KopdesKu brand and v1.2/v1.3 implementation. It simplifies daily work without changing transaction, accounting, RBAC, maker-checker, ledger, D1, Supabase, or PWA business semantics.

## Locked brand boundary

The following are source-of-truth and MUST NOT be redrawn or reinterpreted during v1.4:

- KopdesKu master logo geometry
- KopdesKu app icon / favicon geometry
- brand red and deep navy identity
- existing Poppins family
- production transaction and accounting engines

v1.4 changes presentation and information architecture only unless a separate, explicitly reviewed product feature requires backend work.

## Product principles

1. **Task first** — the most common daily action must be visible before configuration or audit details.
2. **Clear language** — use operational Indonesian labels instead of implementation jargon.
3. **Semantic icons** — transaction identity uses meaningful object/action icons. Generic arrows are reserved for navigation and flow direction.
4. **Amount first** — monetary screens prioritize nominal, status, member, date, then technical reference.
5. **Progressive disclosure** — advanced accounting/audit information remains available but does not dominate daily screens.
6. **Mobile is operational** — responsive is not enough; primary work must be comfortable at 390px and reachable in one or two taps.
7. **One visual language** — dashboard, POS, savings, loans, inventory, procurement, finance, reports, and future member portal reuse the same primitives.

## Typography

Typeface: Poppins.

- Page title: 19–21px, weight 500
- Section title: 15–16px, weight 500
- Card title: 13.5–14px, weight 500
- Body: 13.5–14px, weight 400
- Label: 12–13px, weight 500
- Caption/helper: minimum 11px, weight 400
- Financial primary: 18–22px, weight 500/600
- Weight 600 is reserved for important monetary values and high-priority emphasis.
- Operational content below 11px is prohibited.
- Financial values use tabular numerals.

## Density

- Touch target mobile: minimum 44px
- Operational desktop controls: 40–44px
- Comfortable dashboard cards may be larger, but form/table density must remain efficient.
- Avoid card-inside-card where whitespace and dividers are sufficient.
- Shadows are subtle and primarily used for hover, modal, drawer, and elevated interaction states.

## Semantic transaction icon family

Shared icons live in `src/components/ui/icons.tsx` and use the same outline construction (`strokeWidth=1.8`, round caps/joins).

| Transaction | Shared icon |
| --- | --- |
| Simpanan Masuk | `SavingsDepositIcon` |
| Penarikan Simpanan | `SavingsWithdrawIcon` |
| Angsuran Masuk | `RepaymentIcon` |
| Pengajuan Pinjaman | `LoanApplicationIcon` |
| Pencairan Pinjaman | `DisbursementIcon` |
| Pelunasan / Koreksi | `SettlementIcon` |
| Penjualan | `PosIcon` |
| Pembelian | `PurchaseIcon` |
| Penerimaan Barang | `ReceivingIcon` |
| Rekonsiliasi | `ReconcileIcon` |
| Jurnal | `JournalIcon` |
| Persetujuan | `ApprovalIcon` |
| Reversal | `ReversalIcon` |
| Kas / Bank | `BankIcon` |
| Launcher transaksi | `QuickActionIcon` |

Do not use `→` or a generic bidirectional transaction arrow as the identity of Setoran, Penarikan, Penjualan, Angsuran, or other business actions.

## Semantic colors

Brand colors remain unchanged. Semantic colors support, but never replace, the text label and icon meaning.

- Success / incoming / completed: green semantic token
- Danger / outgoing / destructive: red semantic token
- Warning / pending attention: amber semantic token
- Information / neutral process: blue semantic token
- Navigation/sidebar icons remain primarily monochrome.

## Navigation rules

Desktop is hierarchical and role-aware.

- Beranda
- Kasir & Penjualan
- Simpan Pinjam
- Operasional
- Keuangan
- Persetujuan
- Laporan
- Sistem

Only the active domain is automatically expanded. Configuration remains secondary to daily operations.

Mobile bottom navigation remains:

- Beranda
- Transaksi
- Simpan Pinjam
- Laporan
- Menu

`Transaksi` is a launcher, not a single route. Its icon is `QuickActionIcon`; each transaction inside the launcher uses its own semantic icon and plain-language description.

## Simpan Pinjam golden module

The Simpan Pinjam hub is the reference implementation for v1.4 operational UX.

Primary information:

- Rekening Aktif
- Pinjaman Berjalan
- Pengajuan Menunggu
- Siap Dicairkan

Primary actions:

- Simpanan Masuk — Catat setoran simpanan anggota
- Penarikan Simpanan — Catat pengambilan simpanan anggota
- Angsuran Masuk — Terima pembayaran angsuran pinjaman
- Pengajuan Pinjaman — Buat pengajuan pinjaman baru

Technical statements about ledger implementation, D1, idempotency, or maker-checker must stay in documentation/audit UI rather than the daily hub.

## Mobile rules

At 390px:

- no operational text below 11px
- no horizontal scrolling for primary daily workflows
- primary CTA must not be hidden behind bottom navigation
- forms remain single-column unless two controls are obviously short and safe
- transaction lists prefer cards/activity rows over compressed desktop tables
- destructive actions require clear confirmation and impact summary

## Implementation sequence

1. Foundation + semantic icons
2. App shell and transaction launcher
3. Simpan Pinjam golden module
4. POS visual unification
5. Inventory movement cards
6. Procurement workflow hierarchy
7. Finance/report summary-first treatment
8. Dashboard final task-first composition
9. Global consistency cleanup
10. 390 / 430 / 768 / 1366 / 1440 visual QA
11. Authenticated regression + PWA smoke
12. Merge, deploy, verify, then freeze v1.4

## Non-goals

v1.4 does not implement the future member self-service portal, marketplace checkout, QRIS provider, bank-transfer provider, COD, or member-balance payment engine. Those remain a later member-experience phase after the operational application is stable.
