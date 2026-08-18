import Link from "next/link";
import { KopdesKuBrand } from "@/components/brand/kopdesku-brand";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <KopdesKuBrand dark />
        <p className="eyebrow">KDKMP KEDUNGHARJO · PRODUCTION UAT</p>
        <h1>KopdesKu</h1>
        <p className="lead">
          Integrated Platform untuk operasional Koperasi Desa Merah Putih Kedungharjo: anggota, stok, pembelian, POS, keuangan, simpanan, dan pinjaman.
        </p>
        <div className="status-card">
          <span className="status-dot" />
          <div>
            <strong>Web production-readiness</strong>
            <p>Gate teknis sudah siap; penggunaan data nyata tetap menunggu seluruh UAT operasional dan final release sign-off.</p>
          </div>
        </div>
        <div className="hero-actions">
          <Link className="primary-link" href="/login">Masuk ke KopdesKu</Link>
        </div>
      </section>
    </main>
  );
}
