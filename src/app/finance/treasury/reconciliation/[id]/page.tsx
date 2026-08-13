import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getBankReconciliationDetail } from "@/lib/d1/treasury";
import { completeBankReconciliationAction, setReconciliationItemMatchAction } from "../../actions";
import styles from "./reconciliation.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
}

export default async function ReconciliationDetailPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("FINANCE_VIEW")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.treasuryPeriod) redirect("/setup/database");
  const { id } = await params;
  const messages = await searchParams;
  const detail = await getBankReconciliationDetail(access.organization.id, id);
  if (!detail) notFound();
  const { session, items } = detail;
  const canReconcile = access.permissions.includes("BANK_RECONCILE") && session.status === "DRAFT";
  const ready = session.status === "DRAFT" && session.unmatched_count === 0 && session.difference_amount === 0;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div><p>FINANCE · BANK RECONCILIATION</p><h1>{session.reconciliation_number}</h1></div>
      <nav><Link href="/finance/treasury">Treasury</Link><Link href="/finance">Finance</Link><Link href="/dashboard">Dashboard</Link></nav>
    </header>

    <div className={styles.content}>
      <section className={styles.hero}>
        <div><span>{session.treasury_code} · {session.treasury_name}</span><h2>Rekening koran harus dapat dipertemukan dengan setiap journal line pada akun bank.</h2><p>Periode {session.period_start} → {session.period_end}. Penyelesaian hanya diizinkan bila seluruh item matched dan saldo akhir rekening koran sama dengan saldo General Ledger.</p></div>
        <div className={styles.statusCard}><span>Status</span><strong className={session.status === "RECONCILED" ? styles.pass : styles.check}>{session.status}</strong><small>Dibuat {dateTime(session.created_at)}</small></div>
      </section>

      {messages.status ? <div className={styles.success}>Proses berhasil: {messages.status.replace(/-/g, " ")}.</div> : null}
      {messages.error ? <div className={styles.error}>{messages.error}</div> : null}

      <section className={styles.metrics}>
        <article><span>Statement Closing</span><strong>{rupiah(session.statement_closing_balance)}</strong></article>
        <article><span>System Closing</span><strong>{rupiah(session.system_closing_balance)}</strong></article>
        <article className={session.difference_amount === 0 ? styles.goodMetric : styles.alertMetric}><span>Difference</span><strong>{rupiah(session.difference_amount)}</strong></article>
        <article className={session.unmatched_count === 0 ? styles.goodMetric : styles.alertMetric}><span>Unmatched</span><strong>{session.unmatched_count}</strong><small>dari {session.item_count} item</small></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>JOURNAL MATCHING</span><h3>Bank account journal lines</h3></div><b>{items.length} items</b></div>
        {items.length ? <div className={styles.tableWrap}><table><thead><tr><th>Waktu / Jurnal</th><th>Sumber</th><th>Debit</th><th>Kredit</th><th>Status</th><th>Control</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
          <td><strong>{item.entry_number}</strong><span>{dateTime(item.posted_at)}</span></td>
          <td><strong>{item.source_type}</strong><span>{item.description}</span><small>{item.memo || "—"}</small></td>
          <td>{item.debit_amount ? rupiah(item.debit_amount) : "—"}</td><td>{item.credit_amount ? rupiah(item.credit_amount) : "—"}</td>
          <td><b className={item.matched ? styles.pass : styles.check}>{item.matched ? "MATCHED" : "UNMATCHED"}</b>{item.match_note ? <span>{item.match_note}</span> : null}</td>
          <td>{canReconcile ? <form action={setReconciliationItemMatchAction} className={styles.matchForm}><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="matched" value={item.matched ? "0" : "1"} /><input name="note" maxLength={120} placeholder={item.matched ? "Catatan unmatch" : "Catatan match (opsional)"} /><PendingSubmitButton pendingLabel="Menyimpan…">{item.matched ? "Unmatch" : "Match"}</PendingSubmitButton></form> : "—"}</td>
        </tr>)}</tbody></table></div> : <div className={styles.empty}>Tidak ada journal line pada akun bank untuk periode ini.</div>}
      </section>

      <section className={`${styles.completion} ${ready ? styles.ready : ""}`}>
        <div><strong>{session.status === "RECONCILED" ? "Rekonsiliasi selesai" : ready ? "Ready to reconcile" : "Belum dapat diselesaikan"}</strong><p>{session.status === "RECONCILED" ? `Diselesaikan ${dateTime(session.reconciled_at)}.` : ready ? "Seluruh journal line matched dan difference = Rp0." : `Selesaikan ${session.unmatched_count} unmatched item dan pastikan difference Rp0.`}</p></div>
        {canReconcile ? <form action={completeBankReconciliationAction}><input type="hidden" name="sessionId" value={session.id} /><PendingSubmitButton pendingLabel="Merekonsiliasi…" disabled={!ready}>Complete Reconciliation</PendingSubmitButton></form> : null}
      </section>
    </div>
  </main>;
}
