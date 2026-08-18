"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

type ShellAccess = {
  profile: { fullName: string };
  role: { name: string };
  permissions: string[];
};

type NavItem = {
  label: string;
  href: string;
  permission?: string;
  anyPermissions?: string[];
  badge?: string;
};

const groups: Array<{ section: string; items: NavItem[] }> = [
  { section: "Utama", items: [
    { label: "Dashboard", href: "/dashboard", permission: "DASHBOARD_VIEW" },
    { label: "POS / Kasir", href: "/pos", permission: "POS_ACCESS" },
    { label: "Kasir / Shift", href: "/teller", permission: "POS_ACCESS" },
  ]},
  { section: "Operasional", items: [
    { label: "Anggota", href: "/members", permission: "MEMBER_VIEW" },
    { label: "Stok & Gudang", href: "/inventory", permission: "INVENTORY_VIEW" },
    { label: "Pembelian", href: "/procurement", permission: "PURCHASE_VIEW" },
    { label: "Hutang Pemasok", href: "/procurement/ap", permission: "AP_VIEW" },
  ]},
  { section: "Keuangan", items: [
    { label: "Ringkasan Keuangan", href: "/finance", permission: "FINANCE_VIEW" },
    { label: "Kas & Bank", href: "/finance/treasury", permission: "FINANCE_VIEW" },
    { label: "Jurnal", href: "/finance/journals", permission: "FINANCE_VIEW" },
    { label: "Aset Tetap", href: "/finance/assets", permission: "FINANCE_VIEW" },
    { label: "Kesiapan Tutup Buku", href: "/finance/closing-readiness", permission: "FINANCE_VIEW" },
    { label: "Pengaturan Akuntansi", href: "/finance/settings", anyPermissions: ["ACCOUNTING_MANAGE", "ACCOUNTING_APPROVE"] },
  ]},
  { section: "Simpan Pinjam", items: [
    { label: "Produk Simpanan", href: "/savings/products", permission: "SAVINGS_PRODUCT_VIEW", badge: "Config" },
    { label: "Rekening Simpanan", href: "/savings/accounts", permission: "SAVINGS_ACCOUNT_VIEW" },
    { label: "Laporan & Integritas", href: "/savings/reports", anyPermissions: ["SAVINGS_ACCOUNT_VIEW","SAVINGS_TRANSACTION_VIEW"] },
    { label: "Produk Pinjaman", href: "/loans/products", permission: "LOAN_PRODUCT_VIEW", badge: "Config" },
    { label: "Pengajuan Pinjaman", href: "/loans/applications", permission: "LOAN_APPLICATION_VIEW" },
    { label: "Kontrak & Jadwal", href: "/loans/contracts", permission: "LOAN_CONTRACT_VIEW" },
    { label: "Pencairan Pinjaman", href: "/loans/disbursements", permission: "LOAN_DISBURSEMENT_VIEW" },
    { label: "Angsuran Pinjaman", href: "/loans/repayments", permission: "LOAN_REPAYMENT_VIEW" },
    { label: "Denda & Waiver", href: "/loans/penalties", permission: "LOAN_PENALTY_VIEW" },
    { label: "Koreksi & Pelunasan", href: "/loans/corrections", anyPermissions: ["LOAN_CORRECTION_VIEW","LOAN_REPAYMENT_POST"] },
    { label: "Accounting & Rekonsiliasi", href: "/loans/reports", permission: "LOAN_REPORT_VIEW" },
  ]},
  { section: "Kontrol", items: [
    { label: "Pusat Persetujuan", href: "/approvals", anyPermissions: ["APPROVAL_VIEW","PURCHASE_APPROVE","INVOICE_APPROVE","JOURNAL_APPROVE","ASSET_APPROVE","SAVINGS_PRODUCT_APPROVE","SAVINGS_ACCOUNT_APPROVE","LOAN_PRODUCT_APPROVE","LOAN_APPLICATION_APPROVE","LOAN_DISBURSEMENT_APPROVE","LOAN_PENALTY_WAIVE_APPROVE","LOAN_CORRECTION_APPROVE","ORG_MANAGE"] },
    { label: "Laporan Penjualan", href: "/reports/daily-sales", permission: "REPORT_VIEW" },
    { label: "Kesiapan Rilis", href: "/readiness", permission: "ORG_MANAGE", badge: "Go-Live" },
    { label: "Kapasitas Sistem", href: "/capacity", permission: "ORG_MANAGE", badge: "Zero Cost" },
    { label: "Backup & Pemulihan", href: "/capacity/recovery", permission: "ORG_MANAGE" },
    { label: "Pengaturan Database", href: "/setup/database", permission: "ORG_MANAGE", badge: "System" },
  ]},
];

const noShell = new Set(["/", "/login"]);

function allowed(item: NavItem, permissions: Set<string>) {
  if (item.permission && !permissions.has(item.permission)) return false;
  if (item.anyPermissions?.length && !item.anyPermissions.some((code) => permissions.has(code))) return false;
  return true;
}

function BackButton({ mobile = false, onStart }: { mobile?: boolean; onStart: () => void }) {
  const router = useRouter();
  function back() {
    onStart();
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/dashboard");
  }
  return <button type="button" className={mobile ? "mobile-back-button" : "sidebar-back-button"} onClick={back} title="Kembali ke halaman sebelumnya">
    <span aria-hidden="true">←</span><span>Kembali</span>
  </button>;
}

export function AppNavigationShellV2({ access, children }: { access: ShellAccess; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);

  const permissions = useMemo(() => new Set(access.permissions), [access.permissions]);
  const visibleGroups = useMemo(() => groups
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed(item, permissions)) }))
    .filter((group) => group.items.length), [permissions]);

  const activeHref = visibleGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const displayedActiveHref = pendingHref || activeHref;
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "U";

  useEffect(() => {
    setPendingHref(null);
    setNavigationPending(false);
  }, [pathname]);

  useEffect(() => {
    if (!navigationPending) return;
    const timeout = window.setTimeout(() => {
      setPendingHref(null);
      setNavigationPending(false);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [navigationPending]);

  function warmRoute(href: string) {
    if (href !== pathname) router.prefetch(href);
  }

  function beginNavigation(href?: string) {
    if (href && href === pathname) return;
    if (href) {
      setPendingHref(href);
      router.prefetch(href);
    }
    setNavigationPending(true);
  }

  if (noShell.has(pathname)) return <>{children}</>;

  return <div className={`app-shell ${navigationPending ? "shell-is-navigating" : ""}`}>
    <aside className="desktop-sidebar">
      <Link href="/dashboard" prefetch className="sidebar-brand persistent-brand" aria-label="Buka Dashboard" onPointerEnter={() => warmRoute("/dashboard")} onFocus={() => warmRoute("/dashboard")} onClick={() => beginNavigation("/dashboard")}>
        <div className="brand-mark compact">KD</div><div><strong>KDKMP</strong><span>Kedungharjo</span></div>
      </Link>
      <div className="persistent-back"><BackButton onStart={() => beginNavigation()} /></div>
      <nav className="sidebar-nav" aria-label="Navigasi utama">
        {visibleGroups.map((group) => <section className="nav-group" key={group.section}>
          <p>{group.section}</p>
          {group.items.map((item) => {
            const isPending = pendingHref === item.href;
            return <Link
              href={item.href}
              prefetch
              className={`nav-item ${displayedActiveHref === item.href ? "active" : ""} ${isPending ? "pending" : ""}`}
              key={`${group.section}-${item.label}`}
              onPointerEnter={() => warmRoute(item.href)}
              onFocus={() => warmRoute(item.href)}
              onClick={() => beginNavigation(item.href)}
            >
              <span>{item.label}</span>
              {isPending ? <small className="nav-route-state">Membuka…</small> : item.badge ? <small>{item.badge}</small> : null}
            </Link>;
          })}
        </section>)}
      </nav>
      <div className="sidebar-profile">
        <div className="avatar">{firstName.slice(0,1).toUpperCase()}</div>
        <div className="profile-copy"><strong>{access.profile.fullName}</strong><span>{access.role.name}</span></div>
        <LogoutButton />
      </div>
    </aside>

    <div className="persistent-content">{children}</div>

    <nav className="mobile-bottom-nav" aria-label="Navigasi mobile">
      <BackButton mobile onStart={() => beginNavigation()} />
      <Link className={(pendingHref === "/dashboard" || (!pendingHref && pathname === "/dashboard")) ? "active" : ""} href="/dashboard" prefetch onClick={() => beginNavigation("/dashboard")} onTouchStart={() => warmRoute("/dashboard")}><span>⌂</span>Beranda</Link>
      {permissions.has("POS_ACCESS") ? <Link className={(pendingHref === "/pos" || (!pendingHref && pathname.startsWith("/pos"))) ? "active" : ""} href="/pos" prefetch onClick={() => beginNavigation("/pos")} onTouchStart={() => warmRoute("/pos")}><span>▣</span>Kasir</Link> : <Link href="/dashboard"><span>⌂</span>Beranda</Link>}
      {permissions.has("INVENTORY_VIEW") ? <Link className={(pendingHref === "/inventory" || (!pendingHref && pathname.startsWith("/inventory"))) ? "active" : ""} href="/inventory" prefetch onClick={() => beginNavigation("/inventory")} onTouchStart={() => warmRoute("/inventory")}><span>▤</span>Stok</Link> : <Link href="/dashboard"><span>⌂</span>Beranda</Link>}
      {permissions.has("FINANCE_VIEW") ? <Link className={(pendingHref === "/finance" || (!pendingHref && pathname.startsWith("/finance"))) ? "active" : ""} href="/finance" prefetch onClick={() => beginNavigation("/finance")} onTouchStart={() => warmRoute("/finance")}><span>Rp</span>Keuangan</Link> : <Link href="/dashboard"><span>⌂</span>Beranda</Link>}
    </nav>
  </div>;
}
