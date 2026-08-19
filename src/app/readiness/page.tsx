import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { ACCOUNTING_EVENTS, listAccounts, listMappings } from "@/lib/d1/accounting-config";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getRecoveryReadiness } from "@/lib/d1/recovery-readiness";
import { getTellerReadiness } from "@/lib/d1/teller";
import { createClient } from "@/lib/supabase/server";
import styles from "./readiness.module.css";

export const dynamic="force-dynamic";
type Check={key:string;label:string;detail:string;passed:boolean;href:string};
function payload(value:Record<string,unknown>|null|undefined,key:string){return String(value?.[key]??"");}

export default async function ReleaseReadinessPage(){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("ORG_MANAGE"))redirect("/dashboard");
 const supabase=await createClient();const [schema,teller,recovery,accounts,mappings,supabaseProbe]=await Promise.all([getD1SchemaStatus(),getTellerReadiness(access.organization.id),getRecoveryReadiness(access.organization.id),listAccounts(access.organization.id),listMappings(access.organization.id),supabase.from("members").select("id",{count:"exact",head:true}).eq("organization_id",access.organization.id)]);
 const activeAccountIds=new Set(accounts.filter(x=>x.status==="ACTIVE").map(x=>x.id));const latestByEvent=new Map<string,(typeof mappings)[number]>();for(const row of mappings){if(!latestByEvent.has(row.event_code))latestByEvent.set(row.event_code,row);}const accountingMissing=ACCOUNTING_EVENTS.filter(event=>{const row=latestByEvent.get(event.code);return !row||Number(row.current_approved_version||0)<=0||!row.debit_account_id||!row.credit_account_id||!activeAccountIds.has(row.debit_account_id)||!activeAccountIds.has(row.credit_account_id);});
 const latestD1=recovery.backupHistory.find(item=>["D1","BOTH"].includes(payload(item.payload,"provider")))||null;const latestSupabase=recovery.backupHistory.find(item=>["SUPABASE","BOTH"].includes(payload(item.payload,"provider")))||null;const restorePassed=recovery.restoreHistory.find(item=>payload(item.payload,"status")==="PASSED")||null;
 const checks:Check[]=[
  {key:"d1",label:"D1 schema CURRENT",passed:schema.bound&&schema.current&&!schema.pendingUpgrade,detail:schema.current?`D1 berada di ${schema.currentVersion}.`:`D1 belum CURRENT${schema.currentVersion?` (terakhir ${schema.currentVersion})`:""}.`,href:"/setup/database"},
  {key:"inventory",label:"Fondasi inventory/POS siap",passed:teller.inventoryReady,detail:`Produk aktif ${teller.products}, gudang aktif ${teller.warehouses}, movement stok ${teller.movements}.`,href:"/inventory"},
  {key:"accounting",label:"Mapping accounting inti aktif",passed:accountingMissing.length===0,detail:accountingMissing.length?`Belum siap: ${accountingMissing.map(x=>x.code).join(", ")}.`:`${ACCOUNTING_EVENTS.length} event accounting inti memiliki mapping approved ke akun ACTIVE.`,href:"/finance/settings"},
  {key:"supabase",label:"Supabase Auth/Data terhubung",passed:!supabaseProbe.error,detail:supabaseProbe.error?`Probe gagal: ${supabaseProbe.error.message}`:`Koneksi authenticated ke data organisasi berhasil${typeof supabaseProbe.count==="number"?` · ${supabaseProbe.count} anggota tercatat`:""}.`,href:"/members"},
  {key:"backup-d1",label:"Backup D1 eksternal tercatat",passed:!!latestD1,detail:latestD1?`Terakhir ${new Date(latestD1.createdAt).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}.`:"Belum ada bukti backup D1 yang disimpan di luar database operasional.",href:"/capacity/recovery"},
  {key:"backup-supabase",label:"Backup Supabase eksternal tercatat",passed:!!latestSupabase,detail:latestSupabase?`Terakhir ${new Date(latestSupabase.createdAt).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}.`:"Belum ada bukti backup Supabase yang disimpan di luar aplikasi.",href:"/capacity/recovery"},
  {key:"restore",label:"Uji restore pernah PASSED",passed:!!restorePassed,detail:restorePassed?`Restore terakhir PASSED pada ${new Date(restorePassed.createdAt).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}.`:"Backup belum terbukti bisa dipulihkan melalui uji restore yang dicatat PASSED.",href:"/capacity/recovery"},
 ];
 const passed=checks.filter(x=>x.passed).length;const ready=passed===checks.length;
 return <PageContainer size="full">
  <PageHeader eyebrow="Kontrol · Go-Live" title="Kesiapan Rilis" description="Automated release gate membaca kondisi teknis nyata. READY tidak menggantikan human UAT dan final live verification." actions={<Badge tone={ready?"success":"warning"}>{ready?"READY":"BLOCKED"} · {passed}/{checks.length}</Badge>}/>
  <section className={styles.metrics}><Card density="compact"><span>D1</span><strong>{schema.current?"CURRENT":"CHECK"}</strong><small>{schema.currentVersion||"belum terinisialisasi"}</small></Card><Card density="compact"><span>ACCOUNTING</span><strong>{accountingMissing.length?"CHECK":"READY"}</strong><small>{accountingMissing.length} event bermasalah</small></Card><Card density="compact"><span>BACKUP</span><strong>{latestD1&&latestSupabase?"RECORDED":"CHECK"}</strong><small>D1 + Supabase</small></Card><Card density="compact"><span>RESTORE</span><strong>{restorePassed?"PASSED":"BELUM"}</strong><small>bukti pemulihan</small></Card></section>
  <section className={styles.checks}>{checks.map((check,index)=><Card className={`${styles.check} ${check.passed?styles.pass:styles.fail}`} key={check.key}><div className={styles.number}>{index+1}</div><div><Badge tone={check.passed?"success":"warning"}>{check.passed?"LULUS":"TINDAKAN DIPERLUKAN"}</Badge><h3>{check.label}</h3><p>{check.detail}</p><Link href={check.href}>Buka kontrol →</Link></div><strong className={styles.flag}>{check.passed?"PASS":"BLOCK"}</strong></Card>)}</section>
  <section className={styles.grid}><Card className={styles.panel}><span className={styles.kicker}>UAT MANUAL</span><h3>Tetap wajib sebelum data nyata</h3><div className={styles.rows}><div><span>Role & permission</span><b>MANUAL</b></div><div><span>POS + controlled void</span><b>MANUAL</b></div><div><span>Procurement + AP</span><b>MANUAL</b></div><div><span>Savings lifecycle</span><b>MANUAL</b></div><div><span>Loan lifecycle + reconciliation</span><b>MANUAL</b></div><div><span>Closing + recovery</span><b>MANUAL</b></div></div></Card><Card className={styles.panel}><span className={styles.kicker}>KNOWN RELEASE BOUNDARIES</span><h3>Batas operasional yang tetap eksplisit</h3><div className={styles.rows}><div><span>POS QRIS/Bank provider settlement</span><b>BELUM</b></div><div><span>Loan restructure/write-off/rebate policy</span><b>BELUM</b></div><div><span>Cloudflare live deployment verification</span><b>FINAL GATE</b></div><div><span>PWA / Android APK</span><b>SETELAH WEB UAT</b></div><div><span>Supabase leaked-password protection</span><b>MANUAL SETTING</b></div></div></Card></section>
  <Alert tone="warning" title="Aturan go-live">Gunakan data sintetis untuk UAT. Data anggota/keuangan nyata baru dimasukkan setelah gate teknis lulus, UAT ditandatangani, backup/restore terbukti, dan deployment live diverifikasi.</Alert>
  <section className={styles.actions}><Link href="/capacity/recovery">Backup & Restore</Link><Link href="/finance/closing-readiness">Closing Readiness</Link><Link href="/loans/reports">Loan Reconciliation</Link><Link href="/reports/daily-sales">Sales Report</Link></section>
 </PageContainer>;
}
