import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getAccessContext } from "@/lib/access/context";

export const dynamic = "force-dynamic";

type NavItem = {
  label: string;
  href: string;
  permission?: string;
  badge?: string;
};

const navigation: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "Utama",
    items: [
      { label: "Dashboard", href: "/dashboard", permission: "DASHBOARD_VIEW" },
      { label: "Hari Ini", href: "/dashboard", permission: "DASHBOARD_VIEW", badge: "Soon" },
    ],
  },
  {
    section: "Operasional",
    items: [
      { label: "POS", href: "/pos", permission: "POS_ACCESS", badge: "Demo" },
      { label: "Teller / Shift", href: "/teller", permission: "POS_ACCESS", badge: "Live" },
      { label: "Anggota", href: "/members", permission: "MEMBER_VIEW", badge: "Live" },
      { label: "Inventory", href: "/inventory", permission: "INVENTORY_VIEW", badge: "Live" },
    ],
  },
  {
    section: "Kontrol",
    items: [
      { label: "Keuangan", href: "/dashboard", permission: "FINANCE_VIEW", badge: "Soon" },
      { label: "Approval", href: "/dashboard", permission: "APPROVAL_VIEW", badge: "Soon" },
      { label: "Laporan", href: "/dashboard", permission: "REPORT_VIEW", badge: "Soon" },
    ],
  },
];

export default async function DashboardPage() {
  const access = await getAccessContext();

  if (!access) {
    redirect("/login");
  }

  const allowed = new Set(access.permissions);
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "Manager";

  return (
    <main className="app-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark compact">KD</div>
          <div>
            <strong>KDKMP</strong>
            <span>Kedungharjo</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {navigation.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.permission || allowed.has(item.permission),
            );

            if (!visibleItems.length) return null;

            return (
              <section className="nav-group" key={group.section}>
                <p>{group.section}</p>
                {visibleItems.map((item, index) => (
                  <Link
                    href={item.href}
                    className={`nav-item ${group.section === "Utama" && index === 0 ? "active" : ""}`}
                    key={item.label}
                  >
                    <span>{item.label}</span>
                    {item.badge ? <small>{item.badge}</small> : null}
                  </Link>
                ))}
              </section>
            );
          })}
        </nav>

        <div className="sidebar-profile">
          <div className="avatar">{firstName.slice(0, 1).toUpperCase()}</div>
          <div className="profile-copy">
            <strong>{access.profile.fullName}</strong>
            <span>{access.role.name}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-kicker">{access.organization.name}</p>
            <h1>Selamat datang, {firstName}</h1>
          </div>
          <div className="header-status">
            <span className="status-dot" />
            <div>
              <strong>Development online</strong>
              <span>Cloudflare + Supabase + D1</span>
            </div>
          </div>
        </header>

        <div className="workspace-content">
          <section className="welcome-panel">
            <div>
              <p className="eyebrow dashboard-eyebrow">PHASE 1.2 · ATOMIC POS DEVELOPMENT</p>
              <h2>POS tunai development sudah tersedia di atas fondasi D1, inventory ledger, cash shift, jurnal, dan audit.</h2>
              <p>
                Data anggota tetap dilindungi Supabase RLS. Penjualan tunai sekarang diposting ke D1 sebagai satu batch: sale, detail barang, inventory movement, payment, jurnal, audit, dan idempotency. Gunakan data DEMO sampai pengujian transaksi selesai.
              </p>
            </div>
            <div className="role-chip">
              <span>Role aktif</span>
              <strong>{access.role.name}</strong>
            </div>
          </section>

          <section className="metric-grid" aria-label="Status fondasi">
            <article className="metric-card">
              <span>Organisasi</span>
              <strong>{access.organization.name}</strong>
              <small>{access.organization.code}</small>
            </article>
            <article className="metric-card">
              <span>Unit Scope</span>
              <strong>{access.units.length}</strong>
              <small>{access.units.map((unit) => unit.name).join(", ") || "Belum ada unit"}</small>
            </article>
            <article className="metric-card">
              <span>Permission aktif</span>
              <strong>{access.permissions.length}</strong>
              <small>Server-side RBAC foundation</small>
            </article>
            <article className="metric-card">
              <span>Status akun</span>
              <strong>{access.profile.status}</strong>
              <small>{access.user.email}</small>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel-card next-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-label">PHASE 1.2 ACTIVE</span>
                  <h3>Atomic Retail Transaction</h3>
                </div>
                <span className="panel-pill">POS Demo</span>
              </div>
              <p>
                Buka Inventory untuk stok, Teller untuk membuka shift, lalu POS untuk transaksi tunai DEMO. QRIS dan transaksi uang nyata tetap belum dibuka sampai integrasi pembayaran dan rekonsiliasi selesai.
              </p>
              <div className="step-list">
                <div><b>01</b><span>Member master & pencarian cepat ✓</span></div>
                <div><b>02</b><span>D1 transaction core ✓</span></div>
                <div><b>03</b><span>Product, inventory & cash shift ✓</span></div>
                <div><b>04</b><span>Atomic cash POS + journal ✓</span></div>
              </div>
            </article>

            <article className="panel-card access-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-label">ACCESS CONTEXT</span>
                  <h3>Kewenangan aktif</h3>
                </div>
              </div>
              <div className="permission-list">
                {access.permissions.map((permission) => (
                  <span key={permission}>{permission}</span>
                ))}
              </div>
            </article>
          </section>
        </div>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Navigasi mobile">
        <Link className="active" href="/dashboard"><span>⌂</span>Beranda</Link>
        <Link href="/pos"><span>▣</span>POS</Link>
        <Link href="/teller"><span>◫</span>Teller</Link>
        <Link href="/members"><span>◎</span>Anggota</Link>
        <Link href="/inventory"><span>▤</span>Stok</Link>
      </nav>
    </main>
  );
}
