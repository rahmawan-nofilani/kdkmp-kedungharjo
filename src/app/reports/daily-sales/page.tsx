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
function saleStatus(value:string){return value==="VOIDED"?"Dibatalkan":"Selesai"}
function paymentStatus(value:string){if(value==="PAID")return"Lunas";if(value==="PENDING")return"Menunggu";if(value==="REFUNDED")return"Dikembalikan";if(value==="FAILED")return"Gagal";return value}
function paymentMethod(value:string){if(value==="CASH")return"Tunai";if(value==="BANK_TRANSFER")return"Transfer Bank";if(value==="QRIS")return"QRIS";if(value==="MEMBER_BALANCE")return"Saldo Anggota";return value}

export default async function DailySalesPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("REPORT_VIEW")&&!access.permissions.includes("POS_ACCESS"))redirect("/dashboard");
 const params=await searchParams;const date=/^\d{4}-\d{2}-\d{2}$/.test(params.date??"")?String(params.date):todayWib();const report=await getDailySalesReport(access.organization.id,date);
 return <PageContainer size="full">
  <PageHeader eyebrow="Laporan · Penjualan" title="Laporan Penjualan Harian" description="Lihat omzet, biaya pokok, margin, metode pembayaran, dan transaksi pada tanggal yang dipilih." actions={<form method="get" className={styles.dateForm}><label>Tanggal<input type="date" name="date" defaultValue={date}/></label><button type="submit">Tampilkan</button></form>}/>
  <section className={styles.metrics}><Card density="compact"><span>Transaksi Selesai</span><strong>{report.metrics.transactions}</strong><small>masuk perhitungan omzet</small></Card><Card density="compact"><span>Omzet</span><strong>{rupiah(report.metrics.revenue)}</strong><small>setelah pembatalan</small></Card><Card density="compact"><span>HPP</span><strong>{rupiah(report.metrics.cogs)}</strong><small>biaya pokok penjualan</small></Card><Card density="compact"><span>Margin Kotor</span><strong>{rupiah(report.metrics.grossMargin)}</strong><small>Omzet − HPP</small></Card><Card density="compact"><span>Rata-rata Transaksi</span><strong>{rupiah(report.metrics.averageTicket)}</strong><small>nilai rata-rata struk</small></Card><Card density="compact"><span>Dibatalkan</span><strong>{report.metrics.voided}</strong><small>tetap tersimpan untuk audit</small></Card></section>
  <Card className={styles.paymentPanel}><div><span className={styles.kicker}>Pembayaran</span><h2>Metode Pembayaran</h2></div><div className={styles.paymentGrid}>{report.payments.length?report.payments.map(payment=><Card density="compact" key={payment.method}><span>{paymentMethod(payment.method)}</span><strong>{rupiah(payment.amount)}</strong></Card>):<p>Belum ada pembayaran terkonfirmasi pada tanggal ini.</p>}</div></Card>
  <Card className={styles.tableCard}><div className={styles.tableHeader}><div><span className={styles.kicker}>Transaksi</span><h2>Daftar Penjualan</h2></div><Badge>{report.sales.length} transaksi</Badge></div>{report.sales.length?<>
   <div className={styles.desktopSalesTable}><div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Struk</th><th>Status</th><th>Pembayaran</th><th>Total</th><th></th></tr></thead><tbody>{report.sales.map(sale=><tr key={sale.id}><td>{new Date(sale.sold_at).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"})}</td><td><strong>{sale.receipt_number}</strong></td><td><Badge tone={sale.status==="VOIDED"?"danger":"success"}>{saleStatus(sale.status)}</Badge></td><td>{paymentStatus(sale.payment_status)}</td><td><strong>{rupiah(sale.total_amount)}</strong></td><td><Link href={`/sales/${sale.id}`}>Lihat Struk</Link></td></tr>)}</tbody></table></div></div>
   <div className={styles.mobileSalesList}>{report.sales.map(sale=><article className={styles.saleCard} key={`mobile-${sale.id}`}><div className={styles.saleCardHead}><div><strong>{sale.receipt_number}</strong><span>{new Date(sale.sold_at).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit"})}</span></div><Badge tone={sale.status==="VOIDED"?"danger":"success"}>{saleStatus(sale.status)}</Badge></div><strong className={styles.saleAmount}>{rupiah(sale.total_amount)}</strong><div className={styles.saleMeta}><span>Pembayaran</span><strong>{paymentStatus(sale.payment_status)}</strong></div><Link href={`/sales/${sale.id}`}>Lihat Struk</Link></article>)}</div>
  </>:<div className={styles.empty}>Belum ada transaksi pada tanggal ini.</div>}</Card>
 </PageContainer>;
}
