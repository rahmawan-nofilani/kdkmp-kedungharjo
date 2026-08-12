import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { initializeD1 } from "./actions";
import styles from "./setup.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ status?: string; error?: string }>;
};

export default async function DatabaseSetupPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");

  const params = await searchParams;
  const status = await getD1SchemaStatus();

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.kicker}>DEVELOPMENT SETUP · D1</p>
        <h1>Transaction Database</h1>
        <p className={styles.lead}>
          Database transaksi dipisahkan dari Supabase. Supabase tetap menangani identity, role, permission, dan member registry; D1 menangani produk, inventory movement, teller shift, penjualan, pembayaran, jurnal, audit transaksi, dan idempotency.
        </p>

        <div className={styles.statusGrid}>
          <article className={styles.status}>
            <span>D1 binding</span>
            <strong className={status.bound ? styles.ready : styles.wait}>{status.bound ? "CONNECTED" : "WAITING DEPLOY"}</strong>
          </article>
          <article className={styles.status}>
            <span>Transaction schema</span>
            <strong className={status.initialized ? styles.ready : styles.wait}>{status.initialized ? "INITIALIZED" : "NOT INITIALIZED"}</strong>
          </article>
        </div>

        {params.status === "initialized" ? <div className={styles.alert}>Schema transaksi D1 berhasil dibuat.</div> : null}
        {params.status === "ready" ? <div className={styles.alert}>D1 sudah pernah diinisialisasi dan siap digunakan.</div> : null}
        {params.error ? <div className={`${styles.alert} ${styles.error}`}>Inisialisasi belum berhasil. Pastikan deployment terbaru sudah aktif dan binding DB sudah terprovision.</div> : null}

        <div className={styles.steps}>
          <div><b>01</b><span>Wrangler memprovision binding D1 `DB` melalui deployment Cloudflare.</span></div>
          <div><b>02</b><span>Manager menjalankan bootstrap schema satu kali dari halaman ini.</span></div>
          <div><b>03</b><span>Teller baru boleh membuka cash drawer setelah product & inventory setup selesai.</span></div>
          <div><b>04</b><span>Transaksi uang tetap diblokir sampai posting inventory dan jurnal bersifat atomik.</span></div>
        </div>

        <div className={styles.actions}>
          {!status.initialized ? (
            <form action={initializeD1}>
              <button type="submit" disabled={!status.bound}>Initialize D1 Transaction Core</button>
            </form>
          ) : (
            <Link href="/teller">Lanjut ke Teller</Link>
          )}
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </div>

        <p className={styles.note}>
          Halaman ini hanya dapat dibuka akun dengan permission ORG_MANAGE. Bootstrap bersifat idempotent: jika tabel inti sudah ada, aplikasi tidak membuat database kedua atau menghapus data.
        </p>
      </section>
    </main>
  );
}
