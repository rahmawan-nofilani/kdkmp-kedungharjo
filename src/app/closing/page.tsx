import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getRecentShiftHistory, getShiftReconciliation } from "@/lib/d1/closing";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift } from "@/lib/d1/teller";
import { closeShiftAction } from "@/app/teller/actions";
import styles from "./closing.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ status?: string; error?: string; variance?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function timestamp(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ClosingPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS") && !access.permissions.includes("REPORT_VIEW")) {
    redirect("/dashboard");
  }

  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");

  const params = await searchParams;
  const variance = Number(params.variance ?? "0");
  const [openShift, history] = await Promise.all([
    getOpenShift(access.organization.id, access.user.id),
    getRecentShiftHistory(access.organization.id, 12),
  ]);
  const reconciliation = openShift
    ? await getShiftReconciliation(access.organization.id, openShift.id)
    : null;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span>KONTROL KAS · REKONSILIASI</span>
          <strong>Penutupan Harian</strong>
        </div>
        <nav>
          <Link href="/pos">POS</Link>
          <Link href="/teller">Kasir / Shift</Link>
          <Link href="/reports/daily-sales">Laporan Harian</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.heading}>
          <div>
            <span className={styles.kicker}>TUTUP SHIFT DENGAN BUKTI</span>
            <h1>Penutupan & Rekonsiliasi Kasir</h1>
            <p>
              Shift hanya boleh ditutup ketika penjualan, pembayaran, stok, jurnal, dan transaksi Simpanan pada shift sudah konsisten. Selisih kas tetap dicatat dan tidak pernah dihapus dari jejak audit.
            </p>
          </div>
          <div className={styles.identity}>
            <span>Operator</span>
            <strong>{access.profile.fullName || access.user.email}</strong>
            <small>{access.organization.name}</small>
          </div>
        </section>

        {params.status === "shift-closed" ? (
          <div className={variance === 0 ? styles.success : styles.warning}>
            Shift berhasil ditutup. Selisih kas tercatat {rupiah(variance)}.
          </div>
        ) : null}
        {params.error ? <div className={styles.error}>{params.error}</div> : null}

        {openShift && reconciliation ? (
          <>
            <section className={styles.metrics}>
              <article><span>Kas awal</span><strong>{rupiah(reconciliation.shift.opening_cash_amount)}</strong><small>{timestamp(reconciliation.shift.opened_at)}</small></article>
              <article><span>Transaksi penjualan</span><strong>{reconciliation.metrics.committedTransactions}</strong><small>{reconciliation.metrics.voidedTransactions} void</small></article>
              <article><span>Omzet committed</span><strong>{rupiah(reconciliation.metrics.committedSalesAmount)}</strong><small>semua metode</small></article>
              <article><span>Penjualan tunai</span><strong>{rupiah(reconciliation.metrics.cashConfirmedAmount)}</strong><small>masuk cash drawer</small></article>
              <article><span>Arus kas Simpanan</span><strong>{rupiah(reconciliation.metrics.savingsCashDeltaAmount)}</strong><small>{reconciliation.metrics.savingsTransactionCount} transaksi setoran/penarikan/pembalikan tunai</small></article>
              <article><span>Kas seharusnya</span><strong>{rupiah(reconciliation.metrics.expectedCashAmount)}</strong><small>kas awal + penjualan tunai + arus Simpanan</small></article>
              <article className={reconciliation.passed ? styles.passMetric : styles.failMetric}>
                <span>Pemeriksaan integritas</span>
                <strong>{reconciliation.passed ? "PASS" : "CHECK"}</strong>
                <small>{reconciliation.metrics.issueCount} exception</small>
              </article>
            </section>

            <section className={styles.reconGrid}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className={styles.kicker}>PEMERIKSAAN TRANSAKSI</span>
                    <h2>{reconciliation.passed ? "Semua transaksi konsisten" : "Exception harus diperiksa"}</h2>
                  </div>
                  <span className={reconciliation.passed ? styles.passBadge : styles.checkBadge}>
                    {reconciliation.passed ? "PASS" : `${reconciliation.metrics.issueCount} CHECK`}
                  </span>
                </div>

                {reconciliation.issues.length ? (
                  <div className={styles.issueList}>
                    {reconciliation.issues.map((issue, index) => (
                      <article className={styles.issue} key={`${issue.saleId}-${issue.code}-${index}`}>
                        <div>
                          <span>{issue.code}</span>
                          <strong>{issue.receiptNumber}</strong>
                          <p>{issue.message}</p>
                        </div>
                        <Link href={issue.code === "SAVINGS_JOURNAL" ? "/savings/accounts" : `/sales/${issue.saleId}`}>
                          {issue.code === "SAVINGS_JOURNAL" ? "Periksa rekening" : "Periksa struk"}
                        </Link>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.passBox}>
                    Penjualan, pembayaran, stok, jurnal, dan transaksi Simpanan pada shift ini sudah cocok.
                  </div>
                )}
              </article>

              <aside className={styles.panel}>
                <span className={styles.kicker}>HITUNG KAS</span>
                <h2>Tutup cash drawer</h2>
                <p className={styles.copy}>
                  Hitung uang fisik terlebih dahulu. Kas seharusnya tidak boleh diubah agar selisih dapat dilacak.
                </p>
                <div className={styles.expected}>
                  <span>Kas seharusnya</span>
                  <strong>{rupiah(reconciliation.metrics.expectedCashAmount)}</strong>
                </div>
                <form action={closeShiftAction} className={styles.closeForm}>
                  <label>
                    Kas fisik yang dihitung
                    <input name="countedCashAmount" inputMode="numeric" defaultValue={reconciliation.metrics.expectedCashAmount} required />
                  </label>
                  <button type="submit" disabled={!reconciliation.passed}>
                    {reconciliation.passed ? "Tutup Shift & Catat Rekonsiliasi" : "Perbaiki exception terlebih dahulu"}
                  </button>
                </form>
                <small className={styles.note}>Penutupan menyimpan kas seharusnya, kas fisik, selisih, jumlah transaksi, dan status rekonsiliasi ke jejak audit.</small>
              </aside>
            </section>
          </>
        ) : (
          <section className={styles.noShift}>
            <span className={styles.kicker}>TIDAK ADA SHIFT AKTIF</span>
            <h2>Tidak ada shift aktif untuk akun ini.</h2>
            <p>Buka shift dari Workspace Kasir jika ingin memulai transaksi tunai baru.</p>
            <Link href="/teller">Kembali ke Kasir / Shift</Link>
          </section>
        )}

        <section className={styles.historyPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>RIWAYAT SHIFT</span>
              <h2>12 shift terakhir organisasi</h2>
            </div>
            <Link href="/reports/daily-sales">Lihat laporan penjualan</Link>
          </div>

          {history.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr><th>Dibuka</th><th>Status</th><th>Transaksi</th><th>Omzet</th><th>Kas seharusnya</th><th>Kas fisik</th><th>Selisih</th></tr>
                </thead>
                <tbody>
                  {history.map((shift) => (
                    <tr key={shift.id}>
                      <td>{timestamp(shift.opened_at)}</td>
                      <td><span className={shift.status === "OPEN" ? styles.openBadge : styles.closedBadge}>{shift.status}</span></td>
                      <td>{shift.transaction_count}</td>
                      <td>{rupiah(shift.committed_sales_amount)}</td>
                      <td>{shift.expected_cash_amount == null ? "—" : rupiah(shift.expected_cash_amount)}</td>
                      <td>{shift.counted_cash_amount == null ? "—" : rupiah(shift.counted_cash_amount)}</td>
                      <td className={Number(shift.variance_amount ?? 0) === 0 ? styles.zeroVariance : styles.hasVariance}>
                        {shift.variance_amount == null ? "—" : rupiah(shift.variance_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.empty}>Belum ada riwayat shift.</div>}
        </section>
      </div>
    </main>
  );
}
