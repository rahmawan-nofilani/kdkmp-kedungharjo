import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { listAccounts } from "@/lib/d1/accounting-config";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getControlledJournalDetail } from "@/lib/d1/controlled-journal";
import { approveAndPostControlledJournalAction, cancelControlledJournalAction, rejectControlledJournalAction, reverseControlledJournalAction, submitControlledJournalAction } from "../actions";
import { JournalEditor } from "./journal-editor";
import styles from "./journal-detail.module.css";

export const dynamic="force-dynamic";
type PageProps={params:Promise<{id:string}>;searchParams:Promise<{status?:string;error?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function dateTime(value:string|null){if(!value)return"—";return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"})}
function wibToday(){return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10)}
function statusTone(status:string):"success"|"warning"|"danger"|"info"|"neutral"{if(status==="POSTED")return"success";if(status==="SUBMITTED"||status==="APPROVED")return"warning";if(["REJECTED","CANCELLED","REVERSED"].includes(status))return"danger";if(status==="DRAFT")return"info";return"neutral"}

export default async function ControlledJournalDetailPage({params,searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("FINANCE_VIEW"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.features.controlledJournal)redirect("/setup/database");const{id}=await params;const messages=await searchParams;const detail=await getControlledJournalDetail(access.organization.id,id);if(!detail)notFound();
 const{header,lines}=detail;const accounts=await listAccounts(access.organization.id);const eligibleAccounts=header.journal_type==="OPENING"?accounts.filter((row)=>row.status==="ACTIVE"&&["ASSET","LIABILITY","EQUITY"].includes(row.account_type)):accounts.filter((row)=>row.status==="ACTIVE");const makerPermission=header.journal_type==="OPENING"?access.permissions.includes("OPENING_BALANCE_MANAGE"):access.permissions.includes("JOURNAL_CREATE");const isMaker=header.created_by===access.user.id;const canEdit=header.status==="DRAFT"&&isMaker&&makerPermission;const canApprove=header.status==="SUBMITTED"&&access.permissions.includes("JOURNAL_APPROVE")&&!isMaker;const canReverse=header.status==="POSTED"&&access.permissions.includes("JOURNAL_REVERSE");const balancePass=header.total_debit>0&&header.total_debit===header.total_credit&&header.line_count>=2;
 return <PageContainer size="full">
  <PageHeader eyebrow={`Keuangan · ${header.journal_type}`} title={header.journal_number} description={`${header.description} · ${header.journal_date}`} actions={<div className={styles.panelHeader}><Link href="/finance/journals">Daftar Jurnal</Link><Link href="/finance">Keuangan</Link></div>}/>
  {messages.status?<Alert tone="success" title="Proses berhasil">{messages.status.replace(/-/g," ")}.</Alert>:null}
  {messages.error?<Alert tone="danger" title="Jurnal belum dapat diproses">{messages.error}</Alert>:null}

  <section className={styles.metrics}>
   <Card density="compact"><span>Debit</span><strong>{rupiah(header.total_debit)}</strong></Card>
   <Card density="compact"><span>Kredit</span><strong>{rupiah(header.total_credit)}</strong></Card>
   <Card density="compact" className={balancePass?styles.goodMetric:styles.alertMetric}><span>Balance</span><strong>{balancePass?"PASS":"CHECK"}</strong><small>{rupiah(header.total_debit-header.total_credit)}</small></Card>
   <Card density="compact"><span>Status</span><Badge tone={statusTone(header.status)}>{header.status}</Badge><small>{header.posted_at?`Posted ${dateTime(header.posted_at)}`:`Updated ${dateTime(header.updated_at)}`}</small></Card>
  </section>

  {canEdit?<Card className={styles.panel}><div className={styles.panelHeader}><div><span>DRAFT EDITOR</span><h3>Journal lines</h3></div><Badge tone="info">MAKER EDITABLE</Badge></div><JournalEditor journalId={header.id} journalDate={header.journal_date} description={header.description} journalType={header.journal_type} accounts={eligibleAccounts.map((row)=>({id:row.id,code:row.code,name:row.name,account_type:row.account_type}))} initialLines={lines}/><div className={styles.makerActions}><form action={submitControlledJournalAction}><input type="hidden" name="journalId" value={header.id}/><PendingSubmitButton pendingLabel="Submitting…" disabled={!balancePass}>Submit for Approval</PendingSubmitButton></form><form action={cancelControlledJournalAction}><input type="hidden" name="journalId" value={header.id}/><PendingSubmitButton className={styles.secondaryButton} pendingLabel="Membatalkan…">Cancel DRAFT</PendingSubmitButton></form></div><p className={styles.note}>Simpan Draft setelah setiap perubahan. Submit hanya aktif jika jurnal tersimpan sudah balance.</p></Card>:<Card className={styles.panel}><div className={styles.panelHeader}><div><span>JOURNAL SNAPSHOT</span><h3>Line details</h3></div><Badge tone={statusTone(header.status)}>{header.status}</Badge></div>{lines.length?<div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Akun</th><th>Debit</th><th>Kredit</th><th>Memo</th></tr></thead><tbody>{lines.map((line)=><tr key={line.id}><td>{line.line_no}</td><td><strong>{line.account_code}</strong><span>{line.account_name} · {line.account_type}</span></td><td>{line.debit_amount?rupiah(line.debit_amount):"—"}</td><td>{line.credit_amount?rupiah(line.credit_amount):"—"}</td><td>{line.memo||"—"}</td></tr>)}</tbody></table></div>:<div className={styles.empty}>Belum ada journal line.</div>}</Card>}

  {header.status==="SUBMITTED"?<Card className={styles.decisionPanel}><div><strong>{isMaker?"Menunggu approver berbeda":canApprove?"Approval tersedia":"Approval tidak tersedia untuk role ini"}</strong><p>Approve & Post berjalan atomik. Jika tanggal berada pada periode CLOSED/LOCKED, seluruh approval/posting rollback.</p></div>{canApprove?<div className={styles.decisionActions}><form action={approveAndPostControlledJournalAction}><input type="hidden" name="journalId" value={header.id}/><PendingSubmitButton pendingLabel="Approving & posting…">Approve & Post</PendingSubmitButton></form><form action={rejectControlledJournalAction} className={styles.rejectForm}><input type="hidden" name="journalId" value={header.id}/><input name="reason" required minLength={8} maxLength={240} placeholder="Alasan reject"/><PendingSubmitButton className={styles.rejectButton} pendingLabel="Rejecting…">Reject</PendingSubmitButton></form></div>:null}</Card>:null}

  {canReverse?<Card className={styles.reversalPanel}><div><strong>Controlled Reversal</strong><p>Jurnal POSTED tidak diedit. Sistem membuat journal entry baru dengan debit/kredit dibalik pada tanggal reversal.</p></div><form action={reverseControlledJournalAction} className={styles.reversalForm}><input type="hidden" name="journalId" value={header.id}/><input type="date" name="reversalDate" defaultValue={wibToday()} required/><input name="reason" required minLength={8} maxLength={240} placeholder="Alasan reversal"/><PendingSubmitButton className={styles.rejectButton} pendingLabel="Posting reversal…">Post Reversal</PendingSubmitButton></form></Card>:null}

  <Card className={styles.auditPanel}><div className={styles.panelHeader}><strong>Workflow audit</strong><Badge tone={statusTone(header.status)}>{header.status}</Badge></div><div className={styles.auditGrid}><span>Created<b>{dateTime(header.created_at)}</b></span><span>Submitted<b>{dateTime(header.submitted_at)}</b></span><span>Approved<b>{dateTime(header.approved_at)}</b></span><span>Posted<b>{dateTime(header.posted_at)}</b></span><span>Rejected<b>{dateTime(header.rejected_at)}</b></span><span>Reversed<b>{dateTime(header.reversed_at)}</b></span></div>{header.rejection_reason?<p>Reject reason: {header.rejection_reason}</p>:null}{header.reversal_reason?<p>Reversal reason: {header.reversal_reason}</p>:null}</Card>
  <Alert tone="info" title="Immutable workflow">Maker-checker, balance check, period guard, approval/posting atomik, dan controlled reversal tetap menggunakan server actions yang sama.</Alert>
 </PageContainer>;
}
