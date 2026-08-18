import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="brand-mark">KD</div>
        <p className="eyebrow">KDKMP · RELEASE CANDIDATE</p>
        <h1>KDKMP Kedungharjo</h1>
        <p className="lead">
          Platform operasional Koperasi Desa Merah Putih Kedungharjo untuk anggota, stok, pembelian, POS, keuangan, simpanan, dan pinjaman.
        </p>
        <div className="status-card">
          <span className="status-dot" />
          <div>
            <strong>Web production-readiness</strong>
            <p>Penggunaan data nyata menunggu kesiapan rilis, UAT, backup/restore, dan smoke test production dinyatakan lulus.</p>
          </div>
        </div>
        <div className="hero-actions">
          <Link className="primary-link" href="/login">Masuk ke KDKMP</Link>
        </div>
      </section>
    </main>
  );
}
