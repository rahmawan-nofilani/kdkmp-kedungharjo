import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getBankReconciliationDetail } from "@/lib/d1/treasury";
import { completeBankReconciliationAction, setReconciliationItemMatchAction } from "../../actions";
import styles from "./reconciliation.module.css";

export const dynamic="force-dynamic";
type PageProps={params:Promise<{id:string}>;searchParams:Promise<{status?:string;error?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function dateTime(value:string|null){if(!value)return"—";return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"})}

export default async function ReconciliationDetailPage({params,searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("FINANCE_VIEW"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.features.treasuryPeriod)redirect("/setup/database");const{id}=await params;const messages=await searchParams;const detail=await getBankReconciliationDetail(access.organization.id,id);if(!detail)notFound();
 const{session,items}=detail;const canReconcile=access.permissions.includes("BANK_RECONCILE")&&session.status==="DRAFT";const ready=session.status==="DRAFT"&&session.unmatched_count===0&&session.difference_amount===0;
 return <PageContainer size="full">
  <PageHeader eyebrow="Keuangan · Rekonsiliasi Bank" title={session.reconciliation_number} description={`${session.treasury_code} · ${session.treasury_name} · ${session.period_start} → ${session.period_end}`} actions={<div className={styles.panelHeader}><Link href="/finance/treasury">Kas & Bank</Link><Link href="/finance">Keuangan</Link></div>}/>
  {messages.status?<Alert tone="success" title="Proses berhasil">{messages.status.replace(/-/g," ")}.</Alert>:null}
  {messages.error?<Alert tone="danger" title="Rekonsiliasi belum dapat diproses">{messages.error}</Alert>:null}

  <section className={styles.metrics}>
   <Card density="compact"><span>Statement Closing</span><strong>{rupiah(session.statement_closing_balance)}</strong></Card>
   <Card density="compact"><span>System Closing</span><strong>{rupiah(session.system_closing_balance)}</strong></Card>
   <Card density="compact" className={session.difference_amount===0?styles.goodMetric:styles.alertMetric}><span>Difference</span><strong>{rupiah(session.difference_amount)}</strong></Card>
   <Card density="compact" className={session.unmatched_count===0?styles.goodMetric:styles.alertMetric}><span>Unmatched</span><strong>{session.unmatched_count}</strong><small>dari {session.item_count} item</small></Card>
  </section>

  <Card className={styles.panel}><div className={styles.panelHeader}><div><span>JOURNAL MATCHING</span><h3>Bank account journal lines</h3></div><Badge tone={session.status==="RECONCILED"?"success":"warning"}>{session.status}</Badge></div>{items.length?<div className={styles.tableWrap}><table><thead><tr><th>Waktu / Jurnal</th><th>Sumber</th><th>Debit</th><th>Kredit</th><th>Status</th><th>Control</th></tr></thead><tbody>{items.map((item)=><tr key={item.id}><td><strong>{item.entry_number}</strong><span>{dateTime(item.posted_at)}</span></td><td><strong>{item.source_type}</strong><span>{item.description}</span><small>{item.memo||"—"}</small></td><td>{item.debit_amount?rupiah(item.debit_amount):"—"}</td><td>{item.credit_amount?rupiah(item.credit_amount):"—"}</td><td><Badge tone={item.matched?"success":"warning"}>{item.matched?"MATCHED":"UNMATCHED"}</Badge>{item.match_note?<span>{item.match_note}</span>:null}</td><td>{canReconcile?<form action={setReconciliationItemMatchAction} className={styles.matchForm}><input type="hidden" name="sessionId" value={session.id}/><input type="hidden" name="itemId" value={item.id}/><input type="hidden" name="matched" value={item.matched?"0":"1"}/><input name="note" maxLength={120} placeholder={item.matched?"Catatan unmatch":"Catatan match (opsional)"}/><PendingSubmitButton pendingLabel="Menyimpan…">{item.matched?"Unmatch":"Match"}</PendingSubmitButton></form>:"—"}</td></tr>)}</tbody></table></div>:<div className={styles.empty}>Tidak ada journal line pada akun bank untuk periode ini.</div>}</Card>

  <Card className={`${styles.completion} ${ready?styles.ready:""}`}><div><strong>{session.status==="RECONCILED"?"Rekonsiliasi selesai":ready?"Ready to reconcile":"Belum dapat diselesaikan"}</strong><p>{session.status==="RECONCILED"?`Diselesaikan ${dateTime(session.reconciled_at)}.`:ready?"Seluruh journal line matched dan difference = Rp0.":`Selesaikan ${session.unmatched_count} unmatched item dan pastikan difference Rp0.`}</p></div>{canReconcile?<form action={completeBankReconciliationAction}><input type="hidden" name="sessionId" value={session.id}/><PendingSubmitButton pendingLabel="Merekonsiliasi…" disabled={!ready}>Complete Reconciliation</PendingSubmitButton></form>:null}</Card>
  <Alert tone="info" title="Reconciliation control">Penyelesaian tetap hanya diizinkan bila seluruh item matched dan saldo statement sama dengan saldo General Ledger. Action dan validasi server tidak diubah.</Alert>
 </PageContainer>;
}
