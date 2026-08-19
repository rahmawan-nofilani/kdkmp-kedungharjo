import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listControlledJournals } from "@/lib/d1/controlled-journal";
import { createControlledJournalAction } from "./actions";
import styles from "./journals.module.css";

export const dynamic = "force-dynamic";
type PageProps = { searchParams: Promise<{ status?: string; error?: string }> };
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function dateTime(value:string|null){if(!value)return"—";return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"})}
function wibToday(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10)}
function statusTone(status:string):"success"|"warning"|"danger"|"info"|"neutral"{if(status==="POSTED")return"success";if(status==="SUBMITTED"||status==="APPROVED")return"warning";if(["REJECTED","CANCELLED","REVERSED"].includes(status))return"danger";if(status==="DRAFT")return"info";return"neutral"}

export default async function ControlledJournalsPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("FINANCE_VIEW"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.features.controlledJournal)redirect("/setup/database");const params=await searchParams;
 const journals=await listControlledJournals(access.organization.id,160);const canCreate=access.permissions.includes("JOURNAL_CREATE");const canOpening=access.permissions.includes("OPENING_BALANCE_MANAGE");const canApprove=access.permissions.includes("JOURNAL_APPROVE");
 const drafts=journals.filter((row)=>row.status==="DRAFT").length;const submitted=journals.filter((row)=>row.status==="SUBMITTED").length;const posted=journals.filter((row)=>row.status==="POSTED").length;const activeOpening=journals.find((row)=>row.journal_type==="OPENING"&&["DRAFT","SUBMITTED","APPROVED","POSTED"].includes(row.status));const today=wibToday();
 return <PageContainer size="full">
  <PageHeader eyebrow="Keuangan · Jurnal Terkontrol" title="Jurnal Manual & Saldo Awal" description="Jurnal manual dan opening balance mengikuti balance check, maker-checker, period guard, dan reversal trail yang sama." actions={<div className={styles.panelHeader}><Link href="/finance">Keuangan</Link><Link href="/finance/treasury">Kas & Bank</Link><Link href="/finance/closing-readiness">Kesiapan Tutup Buku</Link></div>}/>
  {params.status?<Alert tone="success" title="Proses berhasil">{params.status.replace(/-/g," ")}.</Alert>:null}
  {params.error?<Alert tone="danger" title="Jurnal belum dapat diproses">{params.error}</Alert>:null}
  <section className={styles.metrics}>
   <Card density="compact"><span>DRAFT</span><strong>{drafts}</strong><small>belum disubmit</small></Card>
   <Card density="compact" className={submitted?styles.alertMetric:undefined}><span>Approval Queue</span><strong>{submitted}</strong><small>{canApprove?"siap diperiksa":"menunggu approver"}</small></Card>
   <Card density="compact"><span>POSTED</span><strong>{posted}</strong><small>controlled journals</small></Card>
   <Card density="compact"><span>Opening Balance</span><strong>{activeOpening?activeOpening.status:"NONE"}</strong><small>{activeOpening?.journal_number||"belum dibuat"}</small></Card>
  </section>

  {(canCreate||canOpening)?<section className={styles.createGrid}>
   {canCreate?<Card className={styles.panel}><div className={styles.panelHeader}><div><span>MANUAL JOURNAL</span><h3>Buat jurnal DRAFT</h3></div><Badge tone="info">MAKER</Badge></div><form action={createControlledJournalAction} className={styles.createForm}><input type="hidden" name="journalType" value="MANUAL"/><label>Tanggal<input type="date" name="journalDate" defaultValue={today} required/></label><label>Deskripsi<input name="description" required minLength={5} maxLength={180} placeholder="Contoh: Akrual biaya operasional"/></label><PendingSubmitButton pendingLabel="Membuat DRAFT…">Buat Manual Journal</PendingSubmitButton></form></Card>:null}
   {canOpening?<Card className={styles.panel}><div className={styles.panelHeader}><div><span>OPENING BALANCE</span><h3>Saldo awal buku besar</h3></div><Badge tone="warning">CONTROLLED</Badge></div>{activeOpening?<div className={styles.openingExisting}><strong>{activeOpening.journal_number}</strong><span>Status {activeOpening.status}. Opening Balance baru hanya dapat dibuat setelah jurnal aktif diselesaikan atau direversal.</span><Link href={`/finance/journals/${activeOpening.id}`}>Buka →</Link></div>:<form action={createControlledJournalAction} className={styles.createForm}><input type="hidden" name="journalType" value="OPENING"/><label>Tanggal efektif<input type="date" name="journalDate" defaultValue={today} required/></label><label>Deskripsi<input name="description" required minLength={5} maxLength={180} defaultValue="Opening Balance KDKMP Kedungharjo"/></label><PendingSubmitButton pendingLabel="Membuat Opening…">Buat Opening Balance</PendingSubmitButton></form>}<p className={styles.note}>Opening Balance hanya menerima akun ASSET, LIABILITY, dan EQUITY.</p></Card>:null}
  </section>:null}

  <Card className={styles.panel}><div className={styles.panelHeader}><div><span>JOURNAL REGISTER</span><h3>Riwayat jurnal terkontrol</h3></div><Badge>{journals.length}</Badge></div>{journals.length?<div className={styles.tableWrap}><table><thead><tr><th>No. / Tanggal</th><th>Jenis</th><th>Deskripsi</th><th>Debit</th><th>Kredit</th><th>Status</th><th>Control</th></tr></thead><tbody>{journals.map((row)=><tr key={row.id}><td><strong>{row.journal_number}</strong><span>{row.journal_date} · dibuat {dateTime(row.created_at)}</span></td><td><Badge tone={row.journal_type==="OPENING"?"warning":"info"}>{row.journal_type}</Badge></td><td><strong>{row.description}</strong><span>{row.line_count} lines</span></td><td>{rupiah(row.total_debit)}</td><td>{rupiah(row.total_credit)}</td><td><Badge tone={statusTone(row.status)}>{row.status}</Badge>{row.status==="SUBMITTED"&&row.created_by===access.user.id?<span>Maker menunggu user lain</span>:null}</td><td><Link href={`/finance/journals/${row.id}`}>Buka →</Link></td></tr>)}</tbody></table></div>:<div className={styles.empty}>Belum ada controlled journal.</div>}</Card>
  <Alert tone="info" title="Ledger safety">Approved & Posted tetap dibuat atomik. Bila journal posting ditolak period guard, approval ikut rollback. POSTED hanya dapat dikoreksi melalui reversal.</Alert>
 </PageContainer>;
}
