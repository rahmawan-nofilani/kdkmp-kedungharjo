import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { initializeD1 } from "./actions";
import styles from "./setup.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    error?: string;
    stage?: string;
    step?: string;
    detail?: string;
  }>;
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
          D1 memakai migration marker bertahap. Data transaksi tidak di-reset ketika modul baru ditambahkan; Manager cukup menjalankan pending migration dari halaman ini setelah deployment baru aktif.
        </p>

        <div className={styles.statusGrid}>
          <article className={styles.status}>
            <span>D1 binding</span>
            <strong className={status.bound ? styles.ready : styles.wait}>{status.bound ? "CONNECTED" : "WAITING DEPLOY"}</strong>
          </article>
          <article className={styles.status}>
            <span>Schema readiness</span>
            <strong className={status.current ? styles.ready : styles.wait}>
              {status.current ? "CURRENT" : status.initialized ? "UPGRADE REQUIRED" : "NOT INITIALIZED"}
            </strong>
          </article>
        </div>

        <div className={styles.steps}>
          <div><b>VERSION</b><span>{status.currentVersion || "Belum ada schema marker"}</span></div>
          <div><b>CORE</b><span>{status.initialized ? "Transaction Core v1 tersedia" : "Transaction Core belum tersedia"}</span></div>
          <div><b>V2</b><span>{status.current ? "Inventory Control v2 tersedia" : "Inventory Control v2 menunggu migration"}</span></div>
          <div><b>DATA</b><span>Migration bersifat additive dan tidak menghapus transaksi yang sudah ada.</span></div>
        </div>

        {params.status === "updated" ? <div className={styles.alert}>Migration D1 berhasil diterapkan. Schema sekarang sudah pada versi terbaru.</div> : null}
        {params.status === "ready" ? <div className={styles.alert}>D1 sudah berada pada schema terbaru dan siap digunakan.</div> : null}
        {params.error ? (
          <div className={`${styles.alert} ${styles.error}`}>
            <strong>Migration belum berhasil.</strong>
            {params.stage ? <span> Stage {params.stage}.</span> : null}
            {params.step ? <span> Gagal pada statement #{params.step}.</span> : null}
            {params.detail ? <div style={{ marginTop: 8, wordBreak: "break-word" }}>{params.detail}</div> : null}
          </div>
        ) : null}

        <div className={styles.actions}>
          {!status.current ? (
            <form action={initializeD1}>
              <button type="submit" disabled={!status.bound}>
                {status.initialized ? "Apply Inventory Control v2 Upgrade" : "Initialize & Upgrade D1"}
              </button>
            </form>
          ) : (
            <Link href="/inventory/opname">Lanjut ke Stock Opname</Link>
          )}
          <Link href="/inventory">Inventory</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>

        <p className={styles.note}>
          Hanya akun dengan ORG_MANAGE yang dapat menjalankan migration. Marker versi baru baru ditulis setelah statement migration selesai, sehingga kegagalan dapat dilacak dan migration aman dijalankan ulang.
        </p>
      </section>
    </main>
  );
}
