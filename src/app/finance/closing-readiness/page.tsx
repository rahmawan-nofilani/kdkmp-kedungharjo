import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { getMonthClosingReadiness } from "@/lib/d1/assets";
import { getD1, getD1SchemaStatus } from "@/lib/d1/context";
import styles from "./closing.module.css";

export const dynamic="force-dynamic";
type Props={searchParams:Promise<{month?:string}>};
function currentWibMonth(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,7)}

export default async function ClosingReadinessPage({searchParams}:Props){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("FINANCE_VIEW"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.features.assetDepreciation)redirect("/setup/database");const params=await searchParams;const month=/^\d{4}-\d{2}$/.test(params.month||"")?String(params.month):currentWibMonth();
 const readiness=await getMonthClosingReadiness(access.organization.id,month);const endMs=Date.parse(`${readiness.bounds.end}T00:00:00+07:00`);const endExclusive=new Date(endMs+86_400_000).toISOString();
 const openShift=await getD1().prepare(`SELECT COUNT(*) AS count FROM teller_shifts WHERE organization_id=? AND status='OPEN' AND opened_at < ?`).bind(access.organization.id,endExclusive).first<{count:number}>();
 const openShiftCount=Number(openShift?.count??0);const checks=[...readiness.checks,{key:"teller-shifts",label:"Tidak ada shift teller yang masih OPEN",passed:openShiftCount===0,detail:openShiftCount===0?"Semua shift teller yang dimulai sebelum akhir periode sudah ditutup dan direkonsiliasi.":`${openShiftCount} shift teller masih OPEN dan harus direkonsiliasi sebelum periode ditutup.`}];const ready=checks.every((check)=>check.passed);
 return <PageContainer size="wide">
  <PageHeader eyebrow="Keuangan · Closing Readiness" title="Kesiapan Tutup Buku" description="Checklist otomatis sebelum CLOSE memastikan jurnal, bank reconciliation, penyusutan, dan shift teller terkait tidak menyisakan blocker operasional." actions={<div className={styles.actions}><Link href="/finance">Keuangan</Link><Link href="/finance/treasury">Kas & Bank</Link><Link href="/finance/journals">Jurnal</Link><Link href="/finance/assets">Aset</Link></div>}/>
  <Card className={styles.filter}><form method="get"><label>Bulan yang dicek<input type="month" name="month" defaultValue={month}/></label><button type="submit">Cek Bulan</button></form><div><span>Rentang</span><strong>{readiness.bounds.start} → {readiness.bounds.end}</strong></div></Card>
  <Card className={ready?styles.readyCard:styles.checkCard}><div><span>STATUS CLOSING</span><h2>{ready?"Bulan ini siap menuju proses tutup buku.":"Masih ada pekerjaan yang perlu diselesaikan sebelum tutup buku."}</h2><p>CLOSE hanya boleh dilakukan setelah seluruh blocker otomatis PASS. LOCK tetap bersifat final dan tidak digunakan sekadar untuk mencoba tombol.</p></div><Badge tone={ready?"success":"warning"}>{ready?"SIAP":"PERLU DICEK"}</Badge><small>Periode {month} · status periode {readiness.periodStatus}</small></Card>

  <section className={styles.checks}>{checks.map((check,index)=><Card density="compact" key={check.key} className={check.passed?styles.pass:styles.fail}><div className={styles.number}>{index+1}</div><div><span>{check.passed?"SELESAI":"PERLU TINDAKAN"}</span><h3>{check.label}</h3><p>{check.detail}</p></div><Badge tone={check.passed?"success":"warning"}>{check.passed?"PASS":"BLOCKER"}</Badge></Card>)}</section>

  {readiness.invoiceAttention>0?<Alert tone="warning" title="Perhatian tambahan: Invoice Supplier">Ada {readiness.invoiceAttention} invoice hingga akhir bulan yang masih DRAFT/MISMATCH/MATCHED. Ini belum menjadi pemblokir otomatis tutup buku, tetapi sebaiknya diperiksa agar hutang supplier tidak tertinggal. <Link href="/procurement/ap">Buka Hutang Supplier →</Link></Alert>:null}

  <section className={styles.actions}>
   <Card density="compact"><span>Jurnal belum selesai?</span><p>Selesaikan DRAFT/SUBMITTED atau batalkan jika memang tidak digunakan.</p><Link href="/finance/journals">Buka Jurnal →</Link></Card>
   <Card density="compact"><span>Bank belum cocok?</span><p>Lakukan pencocokan saldo sistem dengan rekening koran.</p><Link href="/finance/treasury">Buka Kas & Bank →</Link></Card>
   <Card density="compact"><span>Shift teller masih OPEN?</span><p>Rekonsiliasi dan tutup semua shift yang dimulai sebelum akhir periode.</p><Link href="/teller">Buka Kasir / Shift →</Link></Card>
   <Card density="compact"><span>Penyusutan belum selesai?</span><p>Hitung lalu minta user berbeda memeriksa dan mencatat penyusutan.</p><Link href="/finance/assets">Buka Aset →</Link></Card>
  </section>

  <Alert tone="danger" title="LOCK bukan tombol uji">Untuk UAT, gunakan hanya periode dan data sintetis yang memang dipersiapkan. CLOSE tetap dilindungi readiness dan pemeriksaan shift OPEN; LOCK final dilakukan hanya setelah rekonsiliasi selesai dan maker-checker terpenuhi.</Alert>
 </PageContainer>;
}
