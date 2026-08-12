import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return (
    <main className="shell">
      <section className="hero dashboard-card">
        <div className="brand-mark">KD</div>
        <p className="eyebrow">AUTH FOUNDATION · ONLINE</p>
        <h1 className="auth-title">Dashboard Development</h1>
        <p className="lead">
          Supabase Auth sudah terhubung. Tahap berikutnya adalah role, permission, profil organisasi, dan dashboard teller/mobile.
        </p>
        <div className="status-card">
          <span className="status-dot" />
          <div>
            <strong>Sesi terverifikasi</strong>
            <p>{data.user.email ?? "Akun development"}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
