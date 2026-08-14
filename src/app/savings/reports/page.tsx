import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getSavingsIntegrityReport } from "@/lib/d1/savings-report";
import { createClient } from "@/lib/supabase/server";
import styles from "./reports.module.css";

export const dynamic = "force-dynamic";

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default async function SavingsReportsPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("SAVINGS_TX_VIEW") && !access.permissions.includes("REPORT_VIEW")) redirect("/dashboard");

  const schema = await getD1SchemaStatus();
  if (!schema.features.savingsLedger) redirect("/setup/database");

  const supabase = await createClient();
  const [report, registryResult] = await Promise.all([
    getSavingsIntegrityReport(access.organization.id),
    supabase.from("savings_accounts").select("id,status").eq("organization_id", access.organization.id),
  ]);

  const registry = registryResult.data ?? [];
  const activeRegistry = registry.filter((row) => row.status === "ACTIVE").length;
  const pendingRegistry = registry.filter((row) => row.status === "PENDING").length;
  const unsyncedEstimate = Math.max(0, activeRegistry - report.metrics.ledgerAccounts);
  const overallPassed = report.passed && unsyncedEstimate === 0;

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · KONTROL</p><h1>Laporan & Integritas Simpanan</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}>
        <div><span>REKONSILIASI SALDO · LEDGER · JURNAL</span><h2>Pastikan saldo anggota sama dengan catatan akuntansi.</h2><p>Pemeriksaan ini read-only. Sistem tidak mengubah saldo atau jurnal saat halaman dibuka.</p></div>
        <span className={`${styles.status} ${overallPassed ? styles.pass : styles.check}`}>{overallPassed ? "PASS" : "CHECK"}</span>
      </section>

      <section className={styles.metrics}>
        <article className={styles.metric}><span>Total saldo Simpanan</span><strong>{money(report.metrics.totalBalance)}</strong><small>hasil seluruh mutasi ledger</small></article>
        <article className={styles.metric}><span>Rekening ACTIVE</span><strong>{activeRegistry}</strong><small>{report.metrics.ledgerAccounts} sudah punya ledger D1</small></article>
        <article className={styles.metric}><span>Transaksi ledger</span><strong>{report.metrics.transactions}</strong><small>setoran + penarikan + pembalikan</small></article>
        <article className={styles.metric}><span>Menunggu pemeriksa</span><strong>{pendingRegistry}</strong><small>registry Supabase</small></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>INTEGRITY GATE</span><h3>{overallPassed ? "Simpanan konsisten" : "Ada item yang harus diperiksa"}</h3></div><strong>{report.issues.length + (unsyncedEstimate ? 1 : 0)} CHECK</strong></div>
        {overallPassed ? <div className={styles.ok}>Saldo ledger, jurnal transaksi, dan akun kewajiban Simpanan konsisten. Tidak ditemukan saldo negatif.</div> : <div className={styles.issues}>
          {unsyncedEstimate ? <article className={styles.issue}><strong>{unsyncedEstimate} rekening ACTIVE belum masuk ledger D1</strong><p>Rekening lama dapat tersinkron saat detail Saldo & Mutasi dibuka. Rekening baru akan dicoba sinkron otomatis saat diaktifkan.</p></article> : null}
          {report.issues.map((issue) => <article key={issue.code} className={styles.issue}><strong>{issue.count} · {issue.title}</strong><p>{issue.detail}</p></article>)}
        </div>}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>SALDO PER PRODUK</span><h3>Ringkasan kewajiban Simpanan</h3></div><strong>{report.products.length} produk</strong></div>
        {report.products.length ? <div className={styles.tableWrap}><table><thead><tr><th>Produk</th><th>Rekening ledger</th><th>Transaksi</th><th>Saldo</th></tr></thead><tbody>{report.products.map((row) => <tr key={row.product_code}><td><strong>{row.product_name}</strong><br/><small>{row.product_code}</small></td><td>{row.account_count}</td><td>{row.transaction_count}</td><td><strong>{money(row.balance_amount)}</strong></td></tr>)}</tbody></table></div> : <div className={styles.notice}>Belum ada rekening yang masuk ledger D1.</div>}
      </section>

      <section className={styles.notice}><strong>Kontrol Phase 4D:</strong> laporan ini membandingkan mutasi Simpanan dengan jurnal sumber yang sama. Pembayaran belanja POS dari saldo Simpanan tetap NONAKTIF.</section>
    </div>
  </section>;
}
