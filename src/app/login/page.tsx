import Link from "next/link";
import { KopdesKuBrand } from "@/components/brand/kopdesku-brand";
import { LoginForm } from "./login-form";
import styles from "../public.module.css";

export default function LoginPage() {
  return (
    <main className={styles.loginShell}>
      <aside className={styles.loginAside}>
        <KopdesKuBrand inverse />
        <div className={styles.loginAsideCopy}>
          <p className={styles.eyebrow}>KDKMP KEDUNGHARJO</p>
          <h1>Akses aman untuk operasional koperasi.</h1>
          <p>KopdesKu menampilkan menu, data, dan aksi berdasarkan role serta unit scope pengguna. Gunakan hanya akun organisasi yang diberikan administrator.</p>
          <div className={styles.loginBoundary}>
            <strong>Production UAT boundary</strong>
            <span>Gunakan data sintetis sampai final release sign-off menyatakan aplikasi siap untuk data operasional nyata.</span>
          </div>
        </div>
        <span className={styles.loginAsideFooter}>KopdesKu · Integrated Platform</span>
      </aside>

      <section className={styles.loginMain}>
        <div className={styles.loginCard}>
          <KopdesKuBrand compact />
          <h2>Masuk ke KopdesKu</h2>
          <p className={styles.loginIntro}>Masuk menggunakan akun KDKMP Kedungharjo yang telah diaktifkan administrator.</p>
          <LoginForm />
          <Link className={styles.backLink} href="/">← Kembali ke halaman utama</Link>
        </div>
      </section>
    </main>
  );
}
