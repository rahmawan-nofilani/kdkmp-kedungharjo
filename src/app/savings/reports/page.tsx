import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getSavingsIntegrityReport } from "@/lib/d1/savings-report";
import { createClient } from "@/lib/supabase/server";
import styles from "./reports.module.css";

export const dynamic="force-dynamic";
function money(value:unknown){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value||0))}

export default async function SavingsReportsPage(){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("SAVINGS_TX_VIEW")&&!access.permissions.includes("REPORT_VIEW"))redirect("/dashboard");const schema=await getD1SchemaStatus();if(!schema.features.savingsLedger)redirect("/setup/database");const supabase=await createClient();
 const[report,registryResult]=await Promise.all([getSavingsIntegrityReport(access.organization.id),supabase.from("savings_accounts").select("id,status").eq("organization_id",access.organization.id)]);const registry=registryResult.data??[];const activeRegistry=registry.filter((row)=>row.status==="ACTIVE").length;const pendingRegistry=registry.filter((row)=>row.status==="PENDING").length;const unsyncedEstimate=Math.max(0,activeRegistry-report.metrics.ledgerAccounts);const overallPassed=report.passed&&unsyncedEstimate===0;
 return <PageContainer size="full">
  <PageHeader eyebrow="Simpan Pinjam · Laporan" title="Laporan Simpanan" description="Lihat total saldo simpanan, jumlah rekening, transaksi, dan status rekonsiliasi." actions={<div className={styles.panelHead}><Link href="/savings/accounts">Rekening</Link>{access.permissions.includes("SAVINGS_PRODUCT_VIEW")?<Link href="/savings/products">Pengaturan Produk</Link>:null}</div>}/>
  <Card className={styles.hero}><div><span>Status Rekonsiliasi</span><h2>{overallPassed?"Saldo simpanan sesuai dengan pencatatan keuangan.":"Ada data simpanan yang perlu diperiksa."}</h2><p>Pemeriksaan ini hanya membaca data dan tidak mengubah saldo atau transaksi.</p></div><Badge tone={overallPassed?"success":"warning"}>{overallPassed?"Sesuai":"Perlu Diperiksa"}</Badge></Card>
  <section className={styles.metrics}><Card density="compact"><span>Total Saldo Simpanan</span><strong>{money(report.metrics.totalBalance)}</strong><small>seluruh rekening aktif</small></Card><Card density="compact"><span>Rekening Aktif</span><strong>{activeRegistry}</strong><small>{report.metrics.ledgerAccounts} sudah tercatat</small></Card><Card density="compact"><span>Transaksi Simpanan</span><strong>{report.metrics.transactions}</strong><small>setoran, penarikan, dan pembalikan</small></Card><Card density="compact"><span>Menunggu Persetujuan</span><strong>{pendingRegistry}</strong><small>rekening baru</small></Card></section>
  <Card className={styles.panel}><div className={styles.panelHead}><div><span>Kontrol</span><h3>Status Rekonsiliasi</h3></div><Badge tone={overallPassed?"success":"warning"}>{overallPassed?"Tidak Ada Temuan":`${report.issues.length+(unsyncedEstimate?1:0)} Temuan`}</Badge></div>{overallPassed?<Alert tone="success">Saldo simpanan, transaksi, dan pencatatan keuangan sesuai.</Alert>:<div className={styles.issues}>{unsyncedEstimate?<article className={styles.issue}><strong>{unsyncedEstimate} rekening aktif belum tercatat lengkap</strong><p>Buka detail rekening untuk menjalankan sinkronisasi data yang tersedia.</p></article>:null}{report.issues.map((issue)=><article key={issue.code} className={styles.issue}><strong>{issue.count} · {issue.title}</strong><p>{issue.detail}</p></article>)}</div>}</Card>
  <Card className={styles.panel}><div className={styles.panelHead}><div><span>Per Produk</span><h3>Saldo Simpanan per Produk</h3></div><Badge>{report.products.length} produk</Badge></div>{report.products.length?<div className={styles.tableWrap}><table><thead><tr><th>Produk</th><th>Rekening</th><th>Transaksi</th><th>Saldo</th></tr></thead><tbody>{report.products.map((row)=><tr key={row.product_code}><td><strong>{row.product_name}</strong><br/><small>{row.product_code}</small></td><td>{row.account_count}</td><td>{row.transaction_count}</td><td><strong>{money(row.balance_amount)}</strong></td></tr>)}</tbody></table></div>:<div className={styles.notice}>Belum ada rekening simpanan yang tercatat.</div>}</Card>
  <details className={styles.technical}><summary>Informasi teknis rekonsiliasi</summary><div><p>Rekonsiliasi membandingkan transaksi simpanan dengan jurnal sumber yang sama. Pembayaran belanja menggunakan saldo simpanan belum termasuk fitur operasional v1.4 dan akan dibangun pada fase portal anggota.</p></div></details>
 </PageContainer>;
}
