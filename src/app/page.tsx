import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="brand-mark">KD</div>
        <p className="eyebrow">PHASE 0 · DEVELOPMENT</p>
        <h1>KDKMP Kedungharjo</h1>
        <p className="lead">
          Fondasi baru untuk platform operasional Koperasi Desa Merah Putih Kedungharjo.
        </p>
        <div className="status-card">
          <span className="status-dot" />
          <div>
            <strong>Foundation online</strong>
            <p>Belum menggunakan data anggota atau transaksi nyata.</p>
          </div>
        </div>
        <div className="hero-actions">
          <Link className="primary-link" href="/login">Masuk ke Development</Link>
        </div>
      </section>
    </main>
  );
}
