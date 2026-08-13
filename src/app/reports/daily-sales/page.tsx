import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getDailySalesReport } from "@/lib/d1/sales";
import styles from "./daily-sales.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayWib() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function DailySalesPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("REPORT_VIEW") && !access.permissions.includes("POS_ACCESS")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? String(params.date) : todayWib();
  const report = await getDailySalesReport(access.organization.id, date);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span>REPORTING · SALES</span>
          <strong>Laporan Penjualan Harian</strong>
        </div>
        <nav>
          <Link href="/pos">POS</Link>
          <Link href="/teller">Teller</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.heading}>
          <div>
            <span className={styles.kicker}>WIB · ASIA/JAKARTA</span>
            <h1>Ringkasan transaksi {date}</h1>
            <p>Penjualan COMMITTED dihitung sebagai omzet. Transaksi VOIDED tetap ditampilkan untuk jejak audit, tetapi tidak masuk omzet.</p>
          </div>
          <form method="get" className={styles.dateForm}>
            <label>Tanggal<input type="date" name="date" defaultValue={date} /></label>
            <button type="submit">Tampilkan</button>
          </form>
        </section>

        <section className={styles.metrics}>
          <article><span>Transaksi</span><strong>{report.metrics.transactions}</strong><small>COMMITTED</small></article>
          <article><span>Omzet</span><strong>{rupiah(report.metrics.revenue)}</strong><small>setelah void</small></article>
          <article><span>HPP</span><strong>{rupiah(report.metrics.cogs)}</strong><small>cost snapshot</small></article>
          <article><span>Margin kotor</span><strong>{rupiah(report.metrics.grossMargin)}</strong><small>omzet − HPP</small></article>
          <article><span>Avg ticket</span><strong>{rupiah(report.metrics.averageTicket)}</strong><small>rata-rata transaksi</small></article>
          <article><span>Void</span><strong>{report.metrics.voided}</strong><small>audit exception</small></article>
        </section>

        <section className={styles.paymentPanel}>
          <div>
            <span className={styles.kicker}>PAYMENT RECON</span>
            <h2>Metode pembayaran</h2>
          </div>
          <div className={styles.paymentGrid}>
            {report.payments.length ? report.payments.map((payment) => (
              <article key={payment.method}><span>{payment.method}</span><strong>{rupiah(payment.amount)}</strong></article>
            )) : <p>Belum ada pembayaran terkonfirmasi pada tanggal ini.</p>}
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <span className={styles.kicker}>TRANSACTION LOG</span>
              <h2>Daftar transaksi</h2>
            </div>
            <span>{report.sales.length} record</span>
          </div>

          {report.sales.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Waktu</th><th>Struk</th><th>Status</th><th>Payment</th><th>Total</th><th>Aksi</th></tr></thead>
                <tbody>
                  {report.sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.sold_at).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })}</td>
                      <td><strong>{sale.receipt_number}</strong></td>
                      <td><span className={sale.status === "VOIDED" ? styles.voidBadge : styles.okBadge}>{sale.status}</span></td>
                      <td>{sale.payment_status}</td>
                      <td><strong>{rupiah(sale.total_amount)}</strong></td>
                      <td><Link href={`/sales/${sale.id}`}>Lihat Struk</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>Belum ada transaksi pada tanggal ini.</div>
          )}
        </section>
      </div>
    </main>
  );
}
