import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="shell">
      <section className="auth-card">
        <div className="brand-mark">KD</div>
        <p className="eyebrow">AKSES KDKMP</p>
        <h1 className="auth-title">Masuk KDKMP</h1>
        <p className="lead auth-lead">
          Gunakan akun organisasi yang diberikan administrator. Penggunaan data nyata hanya dilakukan setelah gate go-live dinyatakan lulus.
        </p>
        <LoginForm />
        <Link className="text-link" href="/">← Kembali ke halaman status</Link>
      </section>
    </main>
  );
}
