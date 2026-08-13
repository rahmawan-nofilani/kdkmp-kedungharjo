"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

type ShellAccess = {
  profile: { fullName: string };
  organization: { name: string };
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

const navigation: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "Utama",
    items: [
      { label: "Dashboard", href: "/dashboard", permission: "DASHBOARD_VIEW" },
      { label: "POS", href: "/pos", permission: "POS_ACCESS", badge: "Demo" },
      { label: "Teller / Shift", href: "/teller", permission: "POS_ACCESS" },
    ],
  },
  {
    section: "Operasional",
    items: [
      { label: "Anggota", href: "/members", permission: "MEMBER_VIEW" },
      { label: "Stok & Gudang", href: "/inventory", permission: "INVENTORY_VIEW" },
      { label: "Pembelian", href: "/procurement", permission: "PURCHASE_VIEW" },
      { label: "Hutang Supplier", href: "/procurement/ap", permission: "AP_VIEW" },
    ],
  },
  {
    section: "Keuangan",
    items: [
      { label: "Keuangan", href: "/finance", permission: "FINANCE_VIEW" },
      { label: "Kas & Bank", href: "/finance/treasury", permission: "FINANCE_VIEW" },
      { label: "Jurnal", href: "/finance/journals", permission: "FINANCE_VIEW" },
      { label: "Aset Tetap", href: "/finance/assets", permission: "FINANCE_VIEW" },
      { label: "Kesiapan Tutup Buku", href: "/finance/closing-readiness", permission: "FINANCE_VIEW" },
      { label: "Pengaturan Akuntansi", href: "/finance/settings", anyPermissions: ["ACCOUNTING_MANAGE", "ACCOUNTING_APPROVE"] },
    ],
  },
  {
    section: "Kontrol",
    items: [
      { label: "Persetujuan Pembelian", href: "/procurement", permission: "PURCHASE_APPROVE" },
      { label: "Laporan Penjualan", href: "/reports/daily-sales", permission: "REPORT_VIEW" },
      { label: "Database Setup", href: "/setup/database", permission: "ORG_MANAGE", badge: "Dev" },
    ],
  },
];

const PUBLIC_PATHS = new Set(["/", "/login"]);

function canSee(item: NavItem, permissions: Set<string>) {
  if (item.permission && !permissions.has(item.permission)) return false;
  if (item.anyPermissions?.length && !item.anyPermissions.some((code) => permissions.has(code))) return false;
  return true;
}

function BackButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  function goBack() {
    const sameOriginReferrer = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (sameOriginReferrer && window.history.length > 1) router.back();
    else router.push("/dashboard");
  }

  return (
    <button type="button" className={compact ? "mobile-back-button" : "sidebar-back-button"} onClick={goBack}>
      <span aria-hidden="true">←</span>
      <span>{compact ? "Kembali" : "Kembali ke menu sebelumnya"}</span>
    </button>
  );
}

export function AppNavigationShell({ access, children }: { access: ShellAccess; children: ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_PATHS.has(pathname)) return <>{children}</>;

  const permissions = new Set(access.permissions);
  const visibleGroups = navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => canSee(item, permissions)) }))
    .filter((group) => group.items.length > 0);

  const candidates = visibleGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length);
  const activeHref = candidates[0]?.href || "";
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "User";

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <Link href="/dashboard" className="sidebar-brand sidebar-brand-link" aria-label="Kembali ke Dashboard">
          <div className="brand-mark compact">KD</div>
          <div><strong>KDKMP</strong><span>Kedungharjo</span></div>
        </Link>

        <div className="sidebar-back-wrap"><BackButton /></div>

        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {visibleGroups.map((group) => (
            <section className="nav-group" key={group.section}>
              <p>{group.section}</p>
              {group.items.map((item) => (
                <Link href={item.href} className={`nav-item ${activeHref === item.href ? "active" : ""}`} key={`${group.section}-${item.label}`}>
                  <span>{item.label}</span>{item.badge ? <small>{item.badge}</small> : null}
                </Link>
              ))}
            </section>
          ))}
        </nav>

        <div className="sidebar-profile">
          <div className="avatar">{firstName.slice(0, 1).toUpperCase()}</div>
          <div className="profile-copy"><strong>{access.profile.fullName}</strong><span>{access.role.name}</span></div>
          <LogoutButton />
        </div>
      </aside>

      <div className="app-shell-content">{children}</div>

      <nav className="mobile-bottom-nav" aria-label="Navigasi mobile">
        <BackButton compact />
        <Link className={pathname === "/dashboard" ? "active" : ""} href="/dashboard"><span>⌂</span>Beranda</Link>
        {permissions.has("POS_ACCESS") ? <Link className={pathname.startsWith("/pos") ? "active" : ""} href="/pos"><span>▣</span>POS</Link> : <Link href="/dashboard"><span>⌂</span>Beranda</Link>}
        {permissions.has("INVENTORY_VIEW") ? <Link className={pathname.startsWith("/inventory") ? "active" : ""} href="/inventory"><span>▤</span>Stok</Link> : <Link href="/dashboard"><span>⌂</span>Beranda</Link>}
        {permissions.has("FINANCE_VIEW") ? <Link className={pathname.startsWith("/finance") ? "active" : ""} href="/finance"><span>Rp</span>Keuangan</Link> : <Link href="/dashboard"><span>⌂</span>Beranda</Link>}
      </nav>
    </div>
  );
}
