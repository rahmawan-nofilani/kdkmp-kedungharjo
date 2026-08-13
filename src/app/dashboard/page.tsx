import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "Manager";

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <p className="workspace-kicker">{access.organization.name}</p>
          <h1>Selamat datang, {firstName}</h1>
        </div>
      </header>
      <div className="workspace-content">
        <section className="welcome-panel">
          <div>
            <p className="eyebrow dashboard-eyebrow">DASHBOARD KDKMP</p>
            <h2>Ringkasan operasional koperasi.</h2>
            <p>Gunakan sidebar kiri untuk membuka Kasir, Stok & Gudang, Pembelian, Keuangan, Aset, dan Pusat Persetujuan.</p>
          </div>
          <div className="role-chip"><span>Peran aktif</span><strong>{access.role.name}</strong></div>
        </section>
        <section className="metric-grid">
          <article className="metric-card"><span>Organisasi</span><strong>{access.organization.name}</strong><small>{access.organization.code}</small></article>
          <article className="metric-card"><span>Unit kerja</span><strong>{access.units.length}</strong><small>{access.units.map((unit) => unit.name).join(", ") || "Belum ada unit"}</small></article>
          <article className="metric-card"><span>Hak akses</span><strong>{access.permissions.length}</strong><small>Sesuai peran aktif</small></article>
          <article className="metric-card"><span>Status akun</span><strong>{access.profile.status}</strong><small>{access.user.email}</small></article>
        </section>
      </div>
    </section>
  );
}
