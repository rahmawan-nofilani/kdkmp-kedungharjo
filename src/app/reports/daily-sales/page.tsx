import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { getDailySalesReport } from "@/lib/d1/sales";
import styles from "./daily-sales.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{date?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value);}
function todayWib(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10);}

export default async function DailySalesPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("REPORT_VIEW")&&!access.permissions.includes("POS_ACCESS"))redirect("/dashboard");
 const params=await searchParams;const date=/^\d{4}-\d{2}-\d{2}$/.test(params.date??"")?String(params.date):todayWib();const report=await getDailySalesReport(access.organization.id,date);
 return <PageContainer size="full">
  <PageHeader eyebrow="Laporan · Penjualan" title={`Ringkasan transaksi ${date}`} description="Penjualan COMMITTED dihitung sebagai omzet. VOIDED tetap terlihat untuk audit tetapi tidak masuk omzet." actions={<form method="get" className={styles.dateForm}><label>Tanggal<input type="date" name="date" defaultValue={date}/></label><button type="submit">Tampilkan</button></form>}/>
  <section className={styles.metrics}><Card density="compact"><span>Transaksi</span><strong>{report.metrics.transactions}</strong><small>COMMITTED</small></Card><Card density="compact"><span>Omzet</span><strong>{rupiah(report.metrics.revenue)}</strong><small>setelah void</small></Card><Card density="compact"><span>HPP</span><strong>{rupiah(report.metrics.cogs)}</strong><small>cost snapshot</small></Card><Card density="compact"><span>Margin kotor</span><strong>{rupiah(report.metrics.grossMargin)}</strong><small>omzet − HPP</small></Card><Card density="compact"><span>Avg ticket</span><strong>{rupiah(report.metrics.averageTicket)}</strong><small>rata-rata transaksi</small></Card><Card density="compact"><span>Void</span><strong>{report.metrics.voided}</strong><small>audit exception</small></Card></section>
  <Card className={styles.paymentPanel}><div><span className={styles.kicker}>PAYMENT RECON</span><h2>Metode pembayaran</h2></div><div className={styles.paymentGrid}>{report.payments.length?report.payments.map(payment=><Card density="compact" key={payment.method}><span>{payment.method}</span><strong>{rupiah(payment.amount)}</strong></Card>):<p>Belum ada pembayaran terkonfirmasi pada tanggal ini.</p>}</div></Card>
  <Card className={styles.tableCard}><div className={styles.tableHeader}><div><span className={styles.kicker}>TRANSACTION LOG</span><h2>Daftar transaksi</h2></div><Badge>{report.sales.length} record</Badge></div>{report.sales.length?<>
   <div className={styles.desktopSalesTable}><div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Struk</th><th>Status</th><th>Payment</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{report.sales.map(sale=><tr key={sale.id}><td>{new Date(sale.sold_at).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"})}</td><td><strong>{sale.receipt_number}</strong></td><td><Badge tone={sale.status==="VOIDED"?"danger":"success"}>{sale.status}</Badge></td><td>{sale.payment_status}</td><td><strong>{rupiah(sale.total_amount)}</strong></td><td><Link href={`/sales/${sale.id}`}>Lihat Struk</Link></td></tr>)}</tbody></table></div></div>
   <div className={styles.mobileSalesList}>{report.sales.map(sale=><article className={styles.saleCard} key={`mobile-${sale.id}`}><div className={styles.saleCardHead}><div><strong>{sale.receipt_number}</strong><span>{new Date(sale.sold_at).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"})}</span></div><Badge tone={sale.status==="VOIDED"?"danger":"success"}>{sale.status}</Badge></div><strong className={styles.saleAmount}>{rupiah(sale.total_amount)}</strong><div className={styles.saleMeta}><span>Pembayaran</span><strong>{sale.payment_status}</strong></div><Link href={`/sales/${sale.id}`}>Lihat Struk →</Link></article>)}</div>
  </>:<div className={styles.empty}>Belum ada transaksi pada tanggal ini.</div>}</Card>
 </PageContainer>;
}
