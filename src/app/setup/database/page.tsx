import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { initializeD1 } from "./actions";
import styles from "./setup.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ status?: string; error?: string; stage?: string; step?: string; detail?: string }> };

export default async function DatabaseSetupPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");
  const params = await searchParams;
  const status = await getD1SchemaStatus();
  const version = status.currentVersion || "";
  const needsV2 = version === "transaction_core_v1";
  const needsV3 = version === "inventory_control_v2";
  const needsV4 = version === "procurement_v3";
  const needsV5 = version === "procurement_accounting_v4";
  const needsV6 = version === "accounting_config_v5";
  const needsV7 = version === "accounting_runtime_v6";
  const v3Available = ["procurement_v3", "procurement_accounting_v4", "accounting_config_v5", "accounting_runtime_v6", "treasury_period_v7"].includes(version);
  const v4Available = ["procurement_accounting_v4", "accounting_config_v5", "accounting_runtime_v6", "treasury_period_v7"].includes(version);
  const v5Available = ["accounting_config_v5", "accounting_runtime_v6", "treasury_period_v7"].includes(version);
  const v6Available = ["accounting_runtime_v6", "treasury_period_v7"].includes(version);
  const v7Available = version === "treasury_period_v7";

  const upgradeLabel = !status.initialized
    ? "Initialize & Upgrade D1"
    : needsV2
      ? "Apply Inventory Control v2"
      : needsV3
        ? "Apply Procurement v3"
        : needsV4
          ? "Apply Procurement Accounting v4"
          : needsV5
            ? "Apply Accounting Config v5"
            : needsV6
              ? "Apply Accounting Runtime v6"
              : needsV7
                ? "Apply Treasury & Period Control v7"
                : "Apply Pending D1 Upgrades";

  return <main className={styles.page}><section className={styles.card}>
    <p className={styles.kicker}>DEVELOPMENT SETUP · D1</p><h1>Transaction Database</h1>
    <p className={styles.lead}>D1 memakai migration marker bertahap. Data transaksi tidak di-reset ketika modul baru ditambahkan; Manager cukup menjalankan pending migration setelah deployment baru aktif.</p>
    <div className={styles.statusGrid}>
      <article className={styles.status}><span>D1 binding</span><strong className={status.bound ? styles.ready : styles.wait}>{status.bound ? "CONNECTED" : "WAITING DEPLOY"}</strong></article>
      <article className={styles.status}><span>Schema readiness</span><strong className={status.current ? styles.ready : styles.wait}>{status.current ? "CURRENT" : status.initialized ? "UPGRADE REQUIRED" : "NOT INITIALIZED"}</strong></article>
    </div>
    <div className={styles.steps}>
      <div><b>VERSION</b><span>{status.currentVersion || "Belum ada schema marker"}</span></div>
      <div><b>CORE</b><span>{status.initialized ? "Transaction Core v1 tersedia" : "Transaction Core belum tersedia"}</span></div>
      <div><b>V2</b><span>{needsV2 ? "Inventory Control v2 menunggu migration" : status.initialized ? "Inventory Control v2 tersedia / sudah dilewati" : "Menunggu Core"}</span></div>
      <div><b>V3</b><span>{v3Available ? "Procurement v3 tersedia" : "Procurement v3 menunggu migration"}</span></div>
      <div><b>V4</b><span>{v4Available ? "Procurement Accounting v4 tersedia" : "Procurement Accounting v4 menunggu migration"}</span></div>
      <div><b>V5</b><span>{v5Available ? "Configurable COA & Accounting Mapping v5 tersedia" : "Accounting Config v5 menunggu migration"}</span></div>
      <div><b>V6</b><span>{v6Available ? "Runtime Accounting Mapping v6 tersedia" : "Accounting Runtime v6 menunggu migration"}</span></div>
      <div><b>V7</b><span>{v7Available ? "Treasury + Accounting Period Control v7 tersedia" : "Treasury Period v7 menunggu migration"}</span></div>
      <div><b>DATA</b><span>Migration bersifat additive dan tidak menghapus transaksi yang sudah ada.</span></div>
    </div>
    {params.status === "updated" ? <div className={styles.alert}>Migration D1 berhasil diterapkan. Schema sekarang sudah pada versi terbaru.</div> : null}
    {params.status === "ready" ? <div className={styles.alert}>D1 sudah berada pada schema terbaru dan siap digunakan.</div> : null}
    {params.error ? <div className={`${styles.alert} ${styles.error}`}><strong>Migration belum berhasil.</strong>{params.stage ? <span> Stage {params.stage}.</span> : null}{params.step ? <span> Gagal pada statement #{params.step}.</span> : null}{params.detail ? <div style={{ marginTop: 8, wordBreak: "break-word" }}>{params.detail}</div> : null}</div> : null}
    <div className={styles.actions}>
      {!status.current ? <form action={initializeD1}><button type="submit" disabled={!status.bound}>{upgradeLabel}</button></form> : <Link href="/finance/treasury">Lanjut ke Treasury Control</Link>}
      <Link href="/finance">Finance</Link><Link href="/finance/settings">Accounting Settings</Link><Link href="/procurement/ap">AP Control</Link><Link href="/procurement">Procurement</Link><Link href="/inventory/opname">Stock Opname</Link><Link href="/dashboard">Dashboard</Link>
    </div>
    <p className={styles.note}>Hanya akun dengan ORG_MANAGE yang dapat menjalankan migration. Marker versi baru ditulis setelah seluruh statement selesai sehingga migration aman dijalankan ulang.</p>
  </section></main>;
}
