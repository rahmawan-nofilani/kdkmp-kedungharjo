import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";

export async function DashboardContent() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "Manager";

  return <section className="workspace">
    <header className="workspace-header">
      <div><p className="workspace-kicker">{access.organization.name}</p><h1>Selamat datang, {firstName}</h1></div>
      <div className="header-status"><span className="status-dot" /><div><strong>Development online</strong><span>Cloudflare + Supabase + D1</span></div></div>
    </header>
    <div className="workspace-content">
      <section className="welcome-panel">
        <div><p className="eyebrow dashboard-eyebrow">PHASE 3F · ASET & TUTUP BUKU</p><h2>Keuangan sekarang mencakup aset tetap, penyusutan bulanan, dan checklist sebelum tutup buku.</h2><p>Bahasa operasional dibuat lebih sederhana agar mudah digunakan pengurus dan petugas operasional.</p></div>
        <div className="role-chip"><span>Role aktif</span><strong>{access.role.name}</strong></div>
      </section>
      <section className="metric-grid" aria-label="Status fondasi">
        <article className="metric-card"><span>Organisasi</span><strong>{access.organization.name}</strong><small>{access.organization.code}</small></article>
        <article className="metric-card"><span>Unit Scope</span><strong>{access.units.length}</strong><small>{access.units.map((unit) => unit.name).join(", ") || "Belum ada unit"}</small></article>
        <article className="metric-card"><span>Hak akses aktif</span><strong>{access.permissions.length}</strong><small>Kontrol akses server</small></article>
        <article className="metric-card"><span>Status akun</span><strong>{access.profile.status}</strong><small>{access.user.email}</small></article>
      </section>
      <section className="dashboard-grid">
        <article className="panel-card next-panel"><div className="panel-heading"><div><span className="panel-label">PHASE 3F ACTIVE</span><h3>Kontrol Keuangan Bulanan</h3></div><span className="panel-pill">Terhubung</span></div><p>Transaksi, stok, pembelian, jurnal, kas/bank, aset tetap dan proses tutup buku memakai jejak audit yang saling terhubung.</p><div className="step-list"><div><b>01</b><span>POS + Stok + Closing ✓</span></div><div><b>02</b><span>Pembelian + Hutang Supplier ✓</span></div><div><b>03</b><span>Keuangan + Kas/Bank + Jurnal ✓</span></div><div><b>04</b><span>Aset + Penyusutan + Tutup Buku →</span></div></div></article>
        <article className="panel-card access-panel"><div className="panel-heading"><div><span className="panel-label">HAK AKSES</span><h3>Kewenangan akun ini</h3></div></div><div className="permission-list">{access.permissions.map((permission) => <span key={permission}>{permission}</span>)}</div></article>
      </section>
    </div>
  </section>;
}
