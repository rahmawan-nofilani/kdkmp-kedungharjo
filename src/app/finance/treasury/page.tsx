import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { listAccounts } from "@/lib/d1/accounting-config";
import { getD1SchemaStatus } from "@/lib/d1/context";
import {
  listAccountingPeriods,
  listBankReconciliations,
  listTreasuryAccounts,
  listTreasuryTransactions,
} from "@/lib/d1/treasury";
import {
  closeAccountingPeriodAction,
  createAccountingPeriodAction,
  createBankReconciliationAction,
  createTreasuryAccountAction,
  lockAccountingPeriodAction,
  postTreasuryEntryAction,
  reopenAccountingPeriodAction,
  transferTreasuryAction,
} from "./actions";
import styles from "./treasury.module.css";

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

export default async function TreasuryPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("FINANCE_VIEW")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.treasuryPeriod) redirect("/setup/database");
  const params = await searchParams;

  const [treasuryAccounts, transactions, periods, reconciliations, chartAccounts] = await Promise.all([
    listTreasuryAccounts(access.organization.id),
    listTreasuryTransactions(access.organization.id, 120),
    listAccountingPeriods(access.organization.id, 36),
    listBankReconciliations(access.organization.id, 60),
    listAccounts(access.organization.id),
  ]);

  const activeTreasury = treasuryAccounts.filter((row) => row.status === "ACTIVE");
  const bankAccounts = activeTreasury.filter((row) => row.account_type === "BANK");
  const assetAccounts = chartAccounts.filter((row) => row.status === "ACTIVE" && row.account_type === "ASSET");
  const counterpartAccounts = chartAccounts.filter((row) => row.status === "ACTIVE" && (row.account_type === "EXPENSE" || row.account_type === "REVENUE"));
  const canManage = access.permissions.includes("TREASURY_MANAGE");
  const canReconcile = access.permissions.includes("BANK_RECONCILE");
  const canClose = access.permissions.includes("PERIOD_CLOSE");
  const canLock = access.permissions.includes("PERIOD_LOCK");
  const cashBalance = activeTreasury.filter((row) => row.account_type === "CASH").reduce((sum, row) => sum + row.balance_amount, 0);
  const bankBalance = activeTreasury.filter((row) => row.account_type === "BANK").reduce((sum, row) => sum + row.balance_amount, 0);
  const openPeriods = periods.filter((row) => row.status === "OPEN").length;
  const draftRecon = reconciliations.filter((row) => row.status === "DRAFT").length;
  const today = wibToday();
  const currentMonth = today.slice(0, 7);
  const monthStart = `${currentMonth}-01`;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div><p>FINANCE · TREASURY CONTROL</p><h1>Kas, Bank & Accounting Period</h1></div>
      <nav><Link href="/finance">Finance</Link><Link href="/finance/settings">Accounting Settings</Link><Link href="/dashboard">Dashboard</Link></nav>
    </header>

    <div className={styles.content}>
      <section className={styles.hero}>
        <div><span>PHASE 3D · CASH/BANK + PERIOD CONTROL</span><h2>Arus kas tidak hanya tercatat—setiap posting tunduk pada akun, rekonsiliasi, dan status periode.</h2><p>Jurnal baru akan ditolak oleh D1 jika tanggalnya berada pada periode CLOSED/LOCKED. LOCK final membutuhkan user berbeda dari user yang melakukan CLOSE.</p></div>
        <div className={styles.roleCard}><span>Schema</span><strong>{schema.currentVersion}</strong><small>{access.role.name} · {access.organization.name}</small></div>
      </section>

      {params.status ? <div className={styles.success}>Proses berhasil: {params.status.replace(/-/g, " ")}.</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.metrics}>
        <article><span>Kas Ledger</span><strong>{rupiah(cashBalance)}</strong><small>akun treasury CASH aktif</small></article>
        <article><span>Bank Ledger</span><strong>{rupiah(bankBalance)}</strong><small>{bankAccounts.length} rekening bank aktif</small></article>
        <article><span>Open Period</span><strong>{openPeriods}</strong><small>{periods.length} periode tercatat</small></article>
        <article className={draftRecon ? styles.alertMetric : undefined}><span>Recon DRAFT</span><strong>{draftRecon}</strong><small>{reconciliations.length} sesi rekonsiliasi</small></article>
      </section>

      {canManage ? <section className={styles.twoColumn}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>TREASURY ENTRY</span><h3>Income / Expense</h3></div><b>Atomic journal</b></div>
          <form action={postTreasuryEntryAction} className={styles.formGrid}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label>Kas / Bank<select name="treasuryAccountId" required defaultValue=""><option value="" disabled>Pilih rekening</option>{activeTreasury.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
            <label>Jenis<select name="type" defaultValue="EXPENSE"><option value="EXPENSE">EXPENSE / Pengeluaran</option><option value="INCOME">INCOME / Penerimaan</option></select></label>
            <label>Akun lawan<select name="counterpartAccountId" required defaultValue=""><option value="" disabled>Pilih akun</option>{counterpartAccounts.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name} · {row.account_type}</option>)}</select></label>
            <label>Nominal<input type="number" name="amount" min="1" step="1" required placeholder="0" /></label>
            <label className={styles.span2}>Keterangan<input name="description" required minLength={5} maxLength={180} placeholder="Contoh: Biaya listrik gerai Agustus" /></label>
            <label>Referensi<input name="referenceNumber" maxLength={80} placeholder="Opsional" /></label>
            <PendingSubmitButton pendingLabel="Memposting…">Post Transaksi</PendingSubmitButton>
          </form>
          <p className={styles.note}>EXPENSE wajib memilih akun EXPENSE. INCOME wajib memilih akun REVENUE. Server akan menolak kombinasi yang salah.</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>INTERNAL TRANSFER</span><h3>Transfer Kas ↔ Bank</h3></div><b>1 journal</b></div>
          <form action={transferTreasuryAction} className={styles.formGrid}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label>Dari<select name="fromTreasuryAccountId" required defaultValue=""><option value="" disabled>Pilih asal</option>{activeTreasury.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
            <label>Ke<select name="toTreasuryAccountId" required defaultValue=""><option value="" disabled>Pilih tujuan</option>{activeTreasury.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
            <label>Nominal<input type="number" name="amount" min="1" step="1" required placeholder="0" /></label>
            <label>Referensi<input name="referenceNumber" maxLength={80} placeholder="Opsional" /></label>
            <label className={styles.span2}>Keterangan<input name="description" required minLength={5} maxLength={180} placeholder="Contoh: Setoran kas harian ke bank" /></label>
            <PendingSubmitButton pendingLabel="Memindahkan…">Post Transfer</PendingSubmitButton>
          </form>
        </article>
      </section> : null}

      <section className={styles.twoColumn}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>TREASURY REGISTER</span><h3>Kas & rekening bank</h3></div><b>{treasuryAccounts.length}</b></div>
          {canManage ? <form action={createTreasuryAccountAction} className={styles.compactForm}>
            <input name="code" required placeholder="BANK_BSI" maxLength={24} />
            <input name="name" required placeholder="Bank BSI Operasional" maxLength={100} />
            <select name="accountType" defaultValue="BANK"><option value="BANK">BANK</option><option value="CASH">CASH</option></select>
            <select name="chartAccountId" required defaultValue=""><option value="" disabled>Hubungkan akun ASSET</option>{assetAccounts.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select>
            <input name="bankName" placeholder="Nama bank (opsional)" />
            <input name="accountReference" placeholder="Alias / 4 digit akhir" />
            <PendingSubmitButton pendingLabel="Menyimpan…">Tambah</PendingSubmitButton>
          </form> : null}
          <div className={styles.accountList}>{treasuryAccounts.map((row) => <div key={row.id}><div><strong>{row.code} · {row.name}</strong><span>{row.account_type} · {row.chart_account_code} {row.chart_account_name}</span>{row.bank_name || row.account_reference ? <small>{[row.bank_name,row.account_reference].filter(Boolean).join(" · ")}</small> : null}</div><b>{rupiah(row.balance_amount)}</b></div>)}</div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>BANK RECONCILIATION</span><h3>Rekening koran vs ledger</h3></div><b>{reconciliations.length}</b></div>
          {canReconcile && bankAccounts.length ? <form action={createBankReconciliationAction} className={styles.formGrid}>
            <label>Bank<select name="treasuryAccountId" required defaultValue=""><option value="" disabled>Pilih bank</option>{bankAccounts.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
            <label>Saldo akhir rekening koran<input type="number" name="statementClosingBalance" required step="1" defaultValue="0" /></label>
            <label>Dari<input type="date" name="periodStart" defaultValue={monthStart} required /></label>
            <label>Sampai<input type="date" name="periodEnd" defaultValue={today} required /></label>
            <label className={styles.span2}>Catatan<input name="notes" maxLength={180} placeholder="Opsional" /></label>
            <PendingSubmitButton pendingLabel="Membuat snapshot…">Buat Rekonsiliasi</PendingSubmitButton>
          </form> : null}
          <div className={styles.reconList}>{reconciliations.length ? reconciliations.slice(0,10).map((row) => <Link href={`/finance/treasury/reconciliation/${row.id}`} key={row.id}><div><strong>{row.reconciliation_number}</strong><span>{row.treasury_name} · {row.period_start} → {row.period_end}</span></div><div><b className={row.status === "RECONCILED" ? styles.passText : styles.checkText}>{row.status}</b><small>Selisih {rupiah(row.difference_amount)} · {row.unmatched_count} unmatched</small></div></Link>) : <p className={styles.empty}>Belum ada rekonsiliasi.</p>}</div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>ACCOUNTING PERIOD</span><h3>Open / Close / Lock</h3></div><b>{periods.length}</b></div>
        {canClose ? <form action={createAccountingPeriodAction} className={styles.periodCreate}><label>Buat periode bulanan<input type="month" name="month" defaultValue={currentMonth} required /></label><PendingSubmitButton pendingLabel="Membuat…">Buat OPEN Period</PendingSubmitButton></form> : null}
        <div className={styles.periodList}>{periods.length ? periods.map((period) => <article key={period.id}>
          <div className={styles.periodSummary}><div><strong>{period.period_code}</strong><span>{period.period_start} → {period.period_end}</span></div><b className={period.status === "OPEN" ? styles.openText : period.status === "CLOSED" ? styles.checkText : styles.lockText}>{period.status}</b></div>
          <div className={styles.periodMeta}>{period.closed_at ? <span>Closed {dateTime(period.closed_at)}</span> : null}{period.locked_at ? <span>Locked {dateTime(period.locked_at)}</span> : null}</div>
          <div className={styles.periodActions}>
            {period.status === "OPEN" && canClose ? <form action={closeAccountingPeriodAction}><input type="hidden" name="periodId" value={period.id} /><input name="note" required minLength={8} placeholder="Catatan closing" /><PendingSubmitButton pendingLabel="Closing…">Close</PendingSubmitButton></form> : null}
            {period.status === "CLOSED" && canClose ? <form action={reopenAccountingPeriodAction}><input type="hidden" name="periodId" value={period.id} /><input name="note" required minLength={8} placeholder="Alasan reopen" /><PendingSubmitButton pendingLabel="Membuka…">Reopen</PendingSubmitButton></form> : null}
            {period.status === "CLOSED" && canLock ? <form action={lockAccountingPeriodAction}><input type="hidden" name="periodId" value={period.id} /><input name="note" required minLength={8} placeholder="Catatan lock final" /><PendingSubmitButton pendingLabel="Locking…">LOCK Final</PendingSubmitButton></form> : null}
          </div>
        </article>) : <p className={styles.empty}>Belum ada accounting period. Buat periode bulan berjalan.</p>}</div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>RECENT TREASURY</span><h3>Transaksi Kas/Bank manual & transfer</h3></div><b>{transactions.length}</b></div>
        {transactions.length ? <div className={styles.tableWrap}><table><thead><tr><th>Waktu / No.</th><th>Rekening</th><th>Jenis</th><th>Nominal</th><th>Keterangan</th><th>Journal</th></tr></thead><tbody>{transactions.map((row) => <tr key={row.id}><td><strong>{row.transaction_number}</strong><span>{dateTime(row.posted_at)}</span></td><td><strong>{row.treasury_code}</strong><span>{row.treasury_name}</span></td><td><span className={row.direction === "IN" ? styles.inBadge : styles.outBadge}>{row.direction} · {row.transaction_type}</span></td><td><strong>{rupiah(row.amount)}</strong></td><td>{row.description}<span>{row.reference_number || "—"}</span></td><td><strong>{row.journal_number}</strong></td></tr>)}</tbody></table></div> : <p className={styles.empty}>Belum ada transaksi treasury manual.</p>}
      </section>

      <section className={styles.notice}><strong>Period guard aktif di database</strong><p>Jika suatu tanggal sudah berada pada periode CLOSED/LOCKED, D1 menolak journal POSTED baru pada tanggal tersebut. LOCK final bersifat irreversible melalui UI.</p></section>
    </div>
  </main>;
}
