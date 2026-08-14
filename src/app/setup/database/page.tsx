import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { initializeD1 } from "./actions";
import styles from "./setup.module.css";

export const dynamic = "force-dynamic";
type PageProps = { searchParams: Promise<{ status?: string; error?: string; detail?: string }> };

export default async function DatabaseSetupPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");
  const params = await searchParams;
  const status = await getD1SchemaStatus();
  const rows = [
    ["V1", "Inti Transaksi", status.features.transactionCore],
    ["V2", "Kontrol Stok", status.features.inventoryControl],
    ["V3", "Pembelian", status.features.procurement],
    ["V4", "Akuntansi Pembelian", status.features.procurementAccounting],
    ["V5", "Daftar Akun", status.features.accountingConfig],
    ["V6", "Mapping Akuntansi", status.features.accountingRuntime],
    ["V7", "Kas, Bank & Periode", status.features.treasuryPeriod],
    ["V8", "Jurnal Terkontrol", status.features.controlledJournal],
    ["V9", "Aset & Penyusutan", status.features.assetDepreciation],
    ["V10", "Kapasitas Sistem", status.features.systemCapacity],
    ["V11", "Ledger Simpanan", status.features.savingsLedger],
  ] as const;

  return <main className={styles.page}><section className={styles.card}>
    <p className={styles.kicker}>PENGATURAN DEVELOPMENT · D1</p><h1>Database Transaksi</h1>
    <p className={styles.lead}>Upgrade menambah kemampuan baru tanpa menghapus transaksi lama.</p>
    <div className={styles.statusGrid}>
      <article className={styles.status}><span>D1 binding</span><strong className={status.bound ? styles.ready : styles.wait}>{status.bound ? "CONNECTED" : "WAITING DEPLOY"}</strong></article>
      <article className={styles.status}><span>Kesiapan schema</span><strong className={status.current ? styles.ready : styles.wait}>{status.current ? "CURRENT" : status.initialized ? "UPGRADE REQUIRED" : "NOT INITIALIZED"}</strong></article>
    </div>
    <div className={styles.steps}><div><b>VERSI</b><span>{status.currentVersion || "Belum ada schema"}</span></div>{rows.map(([code,label,ready])=><div key={code}><b>{code}</b><span>{ready ? `${label} tersedia` : `${label} menunggu upgrade`}</span></div>)}</div>
    {params.status ? <div className={styles.alert}>Proses database selesai. Periksa status CURRENT di atas.</div> : null}
    {params.error ? <div className={`${styles.alert} ${styles.error}`}>Upgrade belum berhasil. {params.detail || "Coba lagi setelah memastikan deployment terbaru aktif."}</div> : null}
    <div className={styles.actions}>{!status.current ? <form action={initializeD1}><button type="submit" disabled={!status.bound}>Terapkan Upgrade yang Tertunda</button></form> : <Link href="/savings/accounts">Buka Rekening Simpanan</Link>}<Link href="/capacity">Kapasitas Sistem</Link><Link href="/dashboard">Dashboard</Link></div>
    <p className={styles.note}>Hanya Manager dengan ORG_MANAGE yang dapat menjalankan upgrade.</p>
  </section></main>;
}
