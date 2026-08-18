import Link from "next/link";
import { KopdesKuBrand } from "@/components/brand/kopdesku-brand";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="shell">
      <section className="auth-card">
        <KopdesKuBrand dark />
        <p className="eyebrow">AKSES KDKMP KEDUNGHARJO</p>
        <h1 className="auth-title">Masuk ke KopdesKu</h1>
        <p className="lead auth-lead">
          Gunakan akun organisasi yang diberikan administrator. KDKMP Kedungharjo berjalan sebagai organisasi operasional di dalam KopdesKu Integrated Platform.
        </p>
        <LoginForm />
        <Link className="text-link" href="/">← Kembali ke halaman status</Link>
      </section>
    </main>
  );
}
