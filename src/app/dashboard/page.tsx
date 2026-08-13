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
      { label: "POS / Teller", href: "/teller", permission: "POS_ACCESS", badge: "Live" },
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
              <p className="eyebrow dashboard-eyebrow">PHASE 1.1 · INVENTORY + CASH CONTROL</p>
              <h2>D1 aktif. Product master, inventory ledger, dan cash shift Teller mulai tersedia.</h2>
              <p>
                Data anggota tetap dilindungi Supabase RLS, sedangkan produk, movement stok, shift teller, pembayaran, jurnal, audit transaksi, dan idempotency berada di D1. POS penjualan masih digate sampai atomic commit selesai.
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
                  <span className="panel-label">PHASE 1.1 ACTIVE</span>
                  <h3>Transaction Foundation</h3>
                </div>
                <span className="panel-pill">D1 Ready</span>
              </div>
              <p>
                Gunakan Inventory untuk membuat gudang, produk, dan opening stock. Setelah inventory siap, buka shift dari Teller. POS baru dibuka pada fase atomic transaction berikutnya.
              </p>
              <div className="step-list">
                <div><b>01</b><span>Member master & pencarian cepat ✓</span></div>
                <div><b>02</b><span>D1 transaction core ✓</span></div>
                <div><b>03</b><span>Product & inventory foundation ✓</span></div>
                <div><b>04</b><span>Teller shift & cash control ✓</span></div>
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
        <Link href="/teller"><span>▣</span>Teller</Link>
        <Link href="/members"><span>◎</span>Anggota</Link>
        <Link href="/inventory"><span>▤</span>Stok</Link>
        <Link href="/dashboard"><span>•••</span>Lainnya</Link>
      </nav>
    </main>
  );
}
