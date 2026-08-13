import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listControlledJournals } from "@/lib/d1/controlled-journal";
import { createControlledJournalAction } from "./actions";
import styles from "./journals.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ status?: string; error?: string }> };

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
}

function wibToday() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function ControlledJournalsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("FINANCE_VIEW")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.controlledJournal) redirect("/setup/database");
  const params = await searchParams;
  const journals = await listControlledJournals(access.organization.id, 160);
  const canCreate = access.permissions.includes("JOURNAL_CREATE");
  const canOpening = access.permissions.includes("OPENING_BALANCE_MANAGE");
  const canApprove = access.permissions.includes("JOURNAL_APPROVE");
  const drafts = journals.filter((row) => row.status === "DRAFT").length;
  const submitted = journals.filter((row) => row.status === "SUBMITTED").length;
  const posted = journals.filter((row) => row.status === "POSTED").length;
  const activeOpening = journals.find((row) => row.journal_type === "OPENING" && ["DRAFT","SUBMITTED","APPROVED","POSTED"].includes(row.status));
  const today = wibToday();

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div><p>FINANCE · CONTROLLED JOURNAL</p><h1>Manual Journal & Opening Balance</h1></div>
      <nav><Link href="/finance">Finance</Link><Link href="/finance/treasury">Treasury</Link><Link href="/dashboard">Dashboard</Link></nav>
    </header>

    <div className={styles.content}>
      <section className={styles.hero}>
        <div><span>PHASE 3E · CONTROLLED POSTING</span><h2>Jurnal manual tidak pernah langsung menyentuh ledger tanpa balance check dan maker-checker.</h2><p>Opening Balance menggunakan workflow yang sama. POSTED journal tidak dapat diedit; koreksi dibuat sebagai reversal sehingga jejak audit tetap utuh.</p></div>
        <div className={styles.roleCard}><span>Role</span><strong>{access.role.name}</strong><small>{schema.currentVersion} · {access.organization.name}</small></div>
      </section>

      {params.status ? <div className={styles.success}>Proses berhasil: {params.status.replace(/-/g," ")}.</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.metrics}>
        <article><span>DRAFT</span><strong>{drafts}</strong><small>belum disubmit</small></article>
        <article className={submitted ? styles.alertMetric : undefined}><span>Approval Queue</span><strong>{submitted}</strong><small>{canApprove ? "siap diperiksa" : "menunggu approver"}</small></article>
        <article><span>POSTED</span><strong>{posted}</strong><small>controlled journals</small></article>
        <article><span>Opening Balance</span><strong>{activeOpening ? activeOpening.status : "NONE"}</strong><small>{activeOpening?.journal_number || "belum dibuat"}</small></article>
      </section>

      {(canCreate || canOpening) ? <section className={styles.createGrid}>
        {canCreate ? <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>MANUAL JOURNAL</span><h3>Buat jurnal DRAFT</h3></div><b>Maker</b></div>
          <form action={createControlledJournalAction} className={styles.createForm}>
            <input type="hidden" name="journalType" value="MANUAL" />
            <label>Tanggal<input type="date" name="journalDate" defaultValue={today} required /></label>
            <label>Deskripsi<input name="description" required minLength={5} maxLength={180} placeholder="Contoh: Akrual biaya operasional" /></label>
            <PendingSubmitButton pendingLabel="Membuat DRAFT…">Buat Manual Journal</PendingSubmitButton>
          </form>
        </article> : null}

        {canOpening ? <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>OPENING BALANCE</span><h3>Saldo awal buku besar</h3></div><b>Controlled</b></div>
          {activeOpening ? <div className={styles.openingExisting}><strong>{activeOpening.journal_number}</strong><span>Status {activeOpening.status}. Opening Balance baru hanya dapat dibuat setelah jurnal aktif diselesaikan atau direversal.</span><Link href={`/finance/journals/${activeOpening.id}`}>Buka →</Link></div> : <form action={createControlledJournalAction} className={styles.createForm}>
            <input type="hidden" name="journalType" value="OPENING" />
            <label>Tanggal efektif<input type="date" name="journalDate" defaultValue={today} required /></label>
            <label>Deskripsi<input name="description" required minLength={5} maxLength={180} defaultValue="Opening Balance KDKMP Kedungharjo" /></label>
            <PendingSubmitButton pendingLabel="Membuat Opening…">Buat Opening Balance</PendingSubmitButton>
          </form>}
          <p className={styles.note}>Opening Balance hanya menerima akun ASSET, LIABILITY, dan EQUITY. Pendapatan/Beban tidak diizinkan.</p>
        </article> : null}
      </section> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>JOURNAL REGISTER</span><h3>Controlled journal history</h3></div><b>{journals.length}</b></div>
        {journals.length ? <div className={styles.tableWrap}><table><thead><tr><th>No. / Tanggal</th><th>Jenis</th><th>Deskripsi</th><th>Debit</th><th>Kredit</th><th>Status</th><th>Control</th></tr></thead><tbody>{journals.map((row) => <tr key={row.id}>
          <td><strong>{row.journal_number}</strong><span>{row.journal_date} · dibuat {dateTime(row.created_at)}</span></td>
          <td><span className={row.journal_type === "OPENING" ? styles.openingBadge : styles.manualBadge}>{row.journal_type}</span></td>
          <td><strong>{row.description}</strong><span>{row.line_count} lines</span></td>
          <td>{rupiah(row.total_debit)}</td><td>{rupiah(row.total_credit)}</td>
          <td><b className={row.status === "POSTED" ? styles.passText : row.status === "REVERSED" || row.status === "REJECTED" || row.status === "CANCELLED" ? styles.mutedText : row.status === "SUBMITTED" ? styles.checkText : styles.draftText}>{row.status}</b>{row.status === "SUBMITTED" && row.created_by === access.user.id ? <span>Maker menunggu user lain</span> : null}</td>
          <td><Link href={`/finance/journals/${row.id}`}>Buka →</Link></td>
        </tr>)}</tbody></table></div> : <div className={styles.empty}>Belum ada controlled journal.</div>}
      </section>

      <section className={styles.notice}><strong>Ledger safety</strong><p>Approved & Posted dibuat atomik. Bila journal posting ditolak oleh period guard, approval ikut rollback. POSTED hanya bisa dikoreksi melalui reversal.</p></section>
    </div>
  </main>;
}
