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
  <PageHeader eyebrow="Simpan Pinjam · Kontrol" title="Laporan & Integritas Simpanan" description="Rekonsiliasi read-only antara registry rekening, ledger transaksi, jurnal sumber, dan akun kewajiban Simpanan." actions={<div className={styles.panelHead}><Link href="/savings/accounts">Rekening</Link><Link href="/savings/products">Produk</Link></div>}/>
  <Card className={styles.hero}><div><span>REKONSILIASI SALDO · LEDGER · JURNAL</span><h2>{overallPassed?"Saldo anggota konsisten dengan catatan akuntansi.":"Ada item Simpanan yang perlu diperiksa."}</h2><p>Pemeriksaan ini tidak mengubah saldo, mutasi, atau jurnal saat halaman dibuka.</p></div><Badge tone={overallPassed?"success":"warning"}>{overallPassed?"PASS":"CHECK"}</Badge></Card>
  <section className={styles.metrics}><Card density="compact"><span>Total saldo Simpanan</span><strong>{money(report.metrics.totalBalance)}</strong><small>hasil seluruh mutasi ledger</small></Card><Card density="compact"><span>Rekening ACTIVE</span><strong>{activeRegistry}</strong><small>{report.metrics.ledgerAccounts} sudah punya ledger D1</small></Card><Card density="compact"><span>Transaksi ledger</span><strong>{report.metrics.transactions}</strong><small>setoran + penarikan + pembalikan</small></Card><Card density="compact"><span>Menunggu pemeriksa</span><strong>{pendingRegistry}</strong><small>registry Supabase</small></Card></section>
  <Card className={styles.panel}><div className={styles.panelHead}><div><span>INTEGRITY GATE</span><h3>{overallPassed?"Simpanan konsisten":"Ada item yang harus diperiksa"}</h3></div><Badge tone={overallPassed?"success":"warning"}>{report.issues.length+(unsyncedEstimate?1:0)} CHECK</Badge></div>{overallPassed?<Alert tone="success">Saldo ledger, jurnal transaksi, dan akun kewajiban Simpanan konsisten. Tidak ditemukan saldo negatif.</Alert>:<div className={styles.issues}>{unsyncedEstimate?<article className={styles.issue}><strong>{unsyncedEstimate} rekening ACTIVE belum masuk ledger D1</strong><p>Rekening lama dapat tersinkron saat detail Saldo & Mutasi dibuka. Rekening baru dicoba sinkron otomatis saat diaktifkan.</p></article>:null}{report.issues.map((issue)=><article key={issue.code} className={styles.issue}><strong>{issue.count} · {issue.title}</strong><p>{issue.detail}</p></article>)}</div>}</Card>
  <Card className={styles.panel}><div className={styles.panelHead}><div><span>SALDO PER PRODUK</span><h3>Ringkasan kewajiban Simpanan</h3></div><Badge>{report.products.length} produk</Badge></div>{report.products.length?<div className={styles.tableWrap}><table><thead><tr><th>Produk</th><th>Rekening ledger</th><th>Transaksi</th><th>Saldo</th></tr></thead><tbody>{report.products.map((row)=><tr key={row.product_code}><td><strong>{row.product_name}</strong><br/><small>{row.product_code}</small></td><td>{row.account_count}</td><td>{row.transaction_count}</td><td><strong>{money(row.balance_amount)}</strong></td></tr>)}</tbody></table></div>:<div className={styles.notice}>Belum ada rekening yang masuk ledger D1.</div>}</Card>
  <Alert tone="info" title="Kontrol integritas">Laporan membandingkan mutasi Simpanan dengan jurnal sumber yang sama. Pembayaran belanja POS dari saldo Simpanan tetap di luar boundary runtime tersertifikasi.</Alert>
 </PageContainer>;
}
