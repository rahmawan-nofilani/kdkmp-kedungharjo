import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="shell">
      <section className="auth-card">
        <div className="brand-mark">KD</div>
        <p className="eyebrow">AKSES DEVELOPMENT</p>
        <h1 className="auth-title">Masuk KDKMP</h1>
        <p className="lead auth-lead">
          Gunakan akun development yang terdaftar. Data anggota dan transaksi nyata belum digunakan pada fase ini.
        </p>
        <LoginForm />
        <Link className="text-link" href="/">← Kembali ke halaman status</Link>
      </section>
    </main>
  );
}
