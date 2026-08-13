import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import {
  accountingPeriod,
  buildFinancialReadModel,
  foundationAccountName,
  getAccountingIntegrity,
  getTrialBalance,
  listJournalSummaries,
  listLedgerLines,
} from "@/lib/d1/accounting";
import { getD1SchemaStatus } from "@/lib/d1/context";
import styles from "./finance.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
};

function wibToday() {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function FinancePage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("FINANCE_VIEW")) redirect("/dashboard");

  const schema = await getD1SchemaStatus();
  if (!schema.initialized) redirect("/setup/database");

  const params = await searchParams;
  const today = wibToday();
  const from = params.from || monthStart(today);
  const to = params.to || today;
  let period;
  try {
    period = accountingPeriod(from, to);
  } catch {
    period = accountingPeriod(monthStart(today), today);
  }
  const account = params.account?.trim() || null;

  const [trialBalance, integrity, journals, ledger] = await Promise.all([
    getTrialBalance(access.organization.id, period),
    getAccountingIntegrity(access.organization.id, period),
    listJournalSummaries(access.organization.id, period, 120),
    listLedgerLines(access.organization.id, period, account, 300),
  ]);
  const model = buildFinancialReadModel(trialBalance);
  const totalTrialDebit = trialBalance.reduce((sum, row) => sum + row.debit_amount, 0);
  const totalTrialCredit = trialBalance.reduce((sum, row) => sum + row.credit_amount, 0);
  const schemaCurrent = schema.currentVersion === "procurement_accounting_v4";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p>FINANCE · ACCOUNTING CONTROL</p>
          <h1>General Ledger & Financial Read Model</h1>
        </div>
        <nav>
          <Link href="/procurement/ap">AP</Link>
          <Link href="/reports/daily-sales">Sales Report</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.kicker}>PHASE 3A · READ-ONLY ACCOUNTING</span>
            <h2>Setiap transaksi harus dapat ditelusuri sampai debit, kredit, dan posisi keuangannya.</h2>
            <p>
              Tampilan ini membaca jurnal POSTED dari POS, void, receiving, invoice supplier, dan payment. Belum ada manual journal dan belum ada configurable COA pada Phase 3A.
            </p>
          </div>
          <div className={styles.roleCard}>
            <span>Schema aktif</span>
            <strong>{schema.currentVersion || "—"}</strong>
            <small>{schemaCurrent ? "Procurement accounting v4 tersedia" : "Ada migration lanjutan yang perlu dicek"}</small>
          </div>
        </section>

        {!schemaCurrent ? (
          <div className={styles.warning}>
            Schema belum terdeteksi pada procurement_accounting_v4. Laporan jurnal lama tetap dapat dibaca, tetapi Procurement/AP terbaru membutuhkan upgrade D1. <Link href="/setup/database">Buka Database Setup →</Link>
          </div>
        ) : null}

        <section className={styles.filterPanel}>
          <form method="get" className={styles.filterForm}>
            <label>Dari<input type="date" name="from" defaultValue={period.from} /></label>
            <label>Sampai<input type="date" name="to" defaultValue={period.to} /></label>
            {account ? <input type="hidden" name="account" value={account} /> : null}
            <button type="submit">Terapkan Periode</button>
            {account ? <Link href={`/finance?from=${period.from}&to=${period.to}`}>Hapus filter akun</Link> : null}
          </form>
          <div className={styles.periodCopy}><span>Periode</span><strong>{period.from} → {period.to}</strong></div>
        </section>

        <section className={styles.metrics}>
          <article><span>Journal Entries</span><strong>{integrity.entryCount}</strong><small>{integrity.lineCount} journal lines</small></article>
          <article className={integrity.passed ? styles.goodMetric : styles.alertMetric}><span>Journal Integrity</span><strong>{integrity.passed ? "PASS" : "CHECK"}</strong><small>{integrity.exceptions.length} exception</small></article>
          <article><span>Kas + Bank</span><strong>{rupiah(model.cash + model.bank)}</strong><small>Kas {rupiah(model.cash)} · Bank {rupiah(model.bank)}</small></article>
          <article><span>Net Income</span><strong>{rupiah(model.netIncome)}</strong><small>Revenue − Expenses</small></article>
        </section>

        <section className={styles.twoColumn}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.kicker}>PROFIT & LOSS</span><h3>Laba-Rugi periode</h3></div><span className={styles.pill}>Read model</span></div>
            <div className={styles.statementRows}>
              <div><span>Pendapatan</span><strong>{rupiah(model.revenue)}</strong></div>
              <div><span>Beban / HPP</span><strong>{rupiah(model.expenses)}</strong></div>
              <div className={styles.statementTotal}><span>Laba / (Rugi) berjalan</span><strong>{rupiah(model.netIncome)}</strong></div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.kicker}>BALANCE SHEET</span><h3>Persamaan akuntansi</h3></div><span className={`${styles.pill} ${model.equationGap === 0 ? styles.passPill : styles.checkPill}`}>{model.equationGap === 0 ? "BALANCED" : "CHECK"}</span></div>
            <div className={styles.statementRows}>
              <div><span>Aset</span><strong>{rupiah(model.assets)}</strong></div>
              <div><span>Kewajiban</span><strong>{rupiah(model.liabilities)}</strong></div>
              <div><span>Ekuitas tercatat</span><strong>{rupiah(model.equity)}</strong></div>
              <div><span>Laba berjalan</span><strong>{rupiah(model.netIncome)}</strong></div>
              <div className={styles.statementTotal}><span>Equation gap</span><strong>{rupiah(model.equationGap)}</strong></div>
            </div>
            <p className={styles.note}>Gap tidak disembunyikan. Opening equity dan akun configurable akan diselesaikan di Phase 3B.</p>
          </article>
        </section>

        <section className={styles.metricsSecondary}>
          <article><span>Persediaan</span><strong>{rupiah(model.inventory)}</strong></article>
          <article><span>Hutang Supplier</span><strong>{rupiah(model.accountsPayable)}</strong></article>
          <article><span>GRNI</span><strong>{rupiah(model.grni)}</strong></article>
          <article><span>Total Dr / Cr</span><strong>{rupiah(integrity.totalDebit)}</strong><small>Cr {rupiah(integrity.totalCredit)}</small></article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.kicker}>TRIAL BALANCE</span><h3>Neraca saldo</h3></div><span className={styles.pill}>{trialBalance.length} akun</span></div>
          {trialBalance.length ? (
            <div className={styles.tableWrap}><table><thead><tr><th>Akun</th><th>Debit</th><th>Kredit</th><th>Saldo D−K</th><th></th></tr></thead><tbody>
              {trialBalance.map((row) => <tr key={row.account_code}>
                <td><strong>{row.account_code}</strong><span>{foundationAccountName(row.account_code)}</span></td>
                <td>{rupiah(row.debit_amount)}</td><td>{rupiah(row.credit_amount)}</td><td><strong>{rupiah(row.balance_amount)}</strong></td>
                <td><Link href={`/finance?from=${period.from}&to=${period.to}&account=${encodeURIComponent(row.account_code)}`}>Ledger →</Link></td>
              </tr>)}
            </tbody><tfoot><tr><th>Total</th><th>{rupiah(totalTrialDebit)}</th><th>{rupiah(totalTrialCredit)}</th><th>{rupiah(totalTrialDebit - totalTrialCredit)}</th><th></th></tr></tfoot></table></div>
          ) : <div className={styles.empty}>Belum ada jurnal POSTED pada periode ini.</div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.kicker}>GENERAL LEDGER</span><h3>{account ? `${account} · ${foundationAccountName(account)}` : "300 baris ledger terbaru"}</h3></div><span className={styles.pill}>{ledger.length} lines</span></div>
          {ledger.length ? <div className={styles.tableWrap}><table><thead><tr><th>Waktu / Jurnal</th><th>Akun</th><th>Sumber</th><th>Debit</th><th>Kredit</th><th>Memo</th></tr></thead><tbody>{ledger.map((line, index) => <tr key={`${line.journal_entry_id}-${line.account_code}-${index}`}>
            <td><strong>{line.entry_number}</strong><span>{dateTime(line.posted_at || line.created_at)}</span></td>
            <td><strong>{line.account_code}</strong><span>{foundationAccountName(line.account_code)}</span></td>
            <td><strong>{line.source_type}</strong><span>{line.description}</span></td>
            <td>{line.debit_amount ? rupiah(line.debit_amount) : "—"}</td><td>{line.credit_amount ? rupiah(line.credit_amount) : "—"}</td><td>{line.memo || "—"}</td>
          </tr>)}</tbody></table></div> : <div className={styles.empty}>Tidak ada ledger line pada filter ini.</div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.kicker}>JOURNAL CONTROL</span><h3>Journal entries & integrity</h3></div><span className={`${styles.pill} ${integrity.passed ? styles.passPill : styles.checkPill}`}>{integrity.passed ? "PASS" : `${integrity.exceptions.length} EXCEPTION`}</span></div>
          {!integrity.passed && integrity.exceptions.length ? <div className={styles.exceptionList}>{integrity.exceptions.map((journal) => <div key={journal.id}><strong>{journal.entry_number}</strong><span>{journal.source_type} · Dr {rupiah(journal.debit_amount)} · Cr {rupiah(journal.credit_amount)} · {journal.line_count} lines</span></div>)}</div> : <div className={styles.success}>Seluruh jurnal POSTED pada periode ini seimbang dan mempunyai minimal dua journal lines.</div>}
          {journals.length ? <div className={styles.tableWrap}><table><thead><tr><th>Journal</th><th>Source</th><th>Debit</th><th>Kredit</th><th>Status</th></tr></thead><tbody>{journals.map((journal) => <tr key={journal.id}>
            <td><strong>{journal.entry_number}</strong><span>{dateTime(journal.posted_at || journal.created_at)} · {journal.description}</span></td>
            <td><strong>{journal.source_type}</strong><span>{journal.source_id.slice(0, 12)}</span></td>
            <td>{rupiah(journal.debit_amount)}</td><td>{rupiah(journal.credit_amount)}</td><td><span className={journal.balanced ? styles.passText : styles.checkText}>{journal.balanced ? "BALANCED" : "CHECK"}</span></td>
          </tr>)}</tbody></table></div> : null}
        </section>

        <section className={styles.foundationNote}>
          <strong>Accounting foundation notice</strong>
          <p>Nama akun pada Phase 3A berasal dari mapping foundation yang saat ini dipakai POS/Procurement. Phase 3B akan memindahkan COA dan transaction mapping menjadi configurable + versioned + approval-controlled.</p>
        </section>
      </div>
    </main>
  );
}
