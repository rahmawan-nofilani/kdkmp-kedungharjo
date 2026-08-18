import Link from "next/link";
import { KopdesKuBrand } from "@/components/brand/kopdesku-brand";
import styles from "./public.module.css";

const modules = [
  ["Penjualan & Kasir", "POS tunai, shift teller, receipt, dan transaksi."],
  ["Operasional", "Anggota, inventory, procurement, dan hutang pemasok."],
  ["Simpan Pinjam", "Produk, rekening simpanan, pinjaman, dan rekonsiliasi."],
  ["Keuangan & Kontrol", "Kas & bank, jurnal, closing, readiness, dan recovery."],
] as const;

export default function HomePage() {
  return (
    <main className={styles.publicShell}>
      <nav className={styles.publicNav} aria-label="Navigasi publik">
        <KopdesKuBrand />
        <Link className={styles.publicNavLink} href="/login">Masuk</Link>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>KDKMP KEDUNGHARJO · INTEGRATED PLATFORM</p>
          <h1>Satu ruang kerja untuk operasional koperasi.</h1>
          <p className={styles.heroLead}>
            KopdesKu menyatukan penjualan, inventory, pembelian, keuangan, simpanan, pinjaman, approval, dan kontrol operasional KDKMP Kedungharjo dalam satu aplikasi berbasis hak akses.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/login">Masuk ke KopdesKu</Link>
            <Link className={styles.secondaryCta} href="/login">Akses organisasi</Link>
          </div>
          <div className={styles.moduleGrid} aria-label="Cakupan modul KopdesKu">
            {modules.map(([title, description]) => (
              <div className={styles.moduleItem} key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className={styles.statusPanel} aria-label="Status kesiapan platform">
          <div className={styles.statusPanelHeader}>
            <h2>Production readiness</h2>
            <span className={styles.statusPill}>Technical ready</span>
          </div>
          <ul className={styles.statusList}>
            <li><span className={styles.statusDot} aria-hidden="true" /><div><strong>RBAC & organisasi</strong><span>Navigasi dan aksi mengikuti permission serta unit scope pengguna.</span></div></li>
            <li><span className={styles.statusDot} aria-hidden="true" /><div><strong>D1 & Supabase</strong><span>Runtime menggunakan penyimpanan operasional dan identitas production yang terpisah sesuai fungsi.</span></div></li>
            <li><span className={styles.statusDot} aria-hidden="true" /><div><strong>Recovery evidence</strong><span>Backup dan restore verification menjadi bagian dari release gate aplikasi.</span></div></li>
          </ul>
          <p className={styles.statusNote}>Penggunaan data nyata tetap menunggu penyelesaian seluruh UAT operasional dan final release sign-off.</p>
        </aside>
      </section>
    </main>
  );
}
