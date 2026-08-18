import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { createClient } from "@/lib/supabase/server";
import { cancelLoanRepaymentAction, executeLoanRepaymentAction } from "../actions";
import styles from "../../contracts/contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; status?: string; detail?: string }> };
type AllocationRow = { id:string;installment_id:string;installment_number:number;principal_amount:number;interest_amount:number;penalty_amount:number };
type ScheduleRow = { id:string;due_date:string;principal_amount:number;interest_amount:number;paid_principal_amount:number;paid_interest_amount:number;penalty_assessed_amount:number;paid_penalty_amount:number;penalty_waived_amount:number;status:string };
type EventRow = { id:string;event_type:string;from_status:string|null;to_status:string;note:string|null;actor_user_id:string;created_at:string };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function time(value: string | null) {
  return value ? new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"}) : "—";
}
function errorMessage(code?: string,detail?: string) {
  const messages:Record<string,string>={
    contract:"Kontrak tidak lagi aktif untuk pembayaran.",pending:"Masih ada proses pembayaran lain pada kontrak ini.",waiver:"Ada waiver denda yang belum selesai. Selesaikan waiver sebelum membuat pembayaran.",penalty:"Hari keterlambatan bertambah setelah draft dibuat. Batalkan draft dan buat ulang agar denda terbaru ikut dialokasikan.",overpay:"Pembayaran melebihi sisa kewajiban.",amount:"Nominal pembayaran tidak valid.",channel:"Kanal pembayaran tidak valid.",snapshot:"Snapshot produk belum memuat konfigurasi pembayaran terbaru.",reference:"Referensi pembayaran tidak valid.",forbidden:"Hak akses posting pembayaran tidak tersedia.",payload:"Payload eksekusi pembayaran tidak konsisten.",d1:"D1 belum CURRENT.",stale:"Allocation snapshot tidak lagi cocok dengan saldo jadwal. Jangan membuat posting manual; lakukan rekonsiliasi sebelum melanjutkan.",journal:"Journal D1 retry tidak sama dengan journal yang sudah tersimpan.",save:"Proses pembayaran belum dapat diselesaikan.",
  };
  if(code==="d1-post") return `Posting D1 belum selesai${detail?`: ${detail}`:"."} Retry aman karena idempotent.`;
  return code?messages[code]||"Proses pembayaran belum dapat diselesaikan.":null;
}

export default async function LoanRepaymentDetailPage({params,searchParams}:PageProps){
  const access=await getAccessContext();
  if(!access) redirect("/login");
  if(!access.permissions.includes("LOAN_REPAYMENT_VIEW")) redirect("/dashboard");
  const [{id},query,schema]=await Promise.all([params,searchParams,getD1SchemaStatus()]);
  const supabase=await createClient();
  const {data:row,error}=await supabase.from("loan_repayments").select("*").eq("id",id).eq("organization_id",access.organization.id).maybeSingle();
  if(error||!row) notFound();
  const [contractResult,memberResult,allocationResult,eventResult]=await Promise.all([
    supabase.from("loan_contracts").select("id,contract_number,status,principal_amount,total_interest_amount,total_installment_amount,first_due_date").eq("id",row.contract_id).eq("organization_id",access.organization.id).maybeSingle(),
    supabase.from("members").select("member_number,full_name").eq("id",row.member_id).eq("organization_id",access.organization.id).maybeSingle(),
    supabase.from("loan_repayment_allocations").select("id,installment_id,installment_number,principal_amount,interest_amount,penalty_amount").eq("repayment_id",id).eq("organization_id",access.organization.id).order("installment_number",{ascending:true}),
    supabase.from("loan_repayment_events").select("id,event_type,from_status,to_status,note,actor_user_id,created_at").eq("repayment_id",id).eq("organization_id",access.organization.id).order("created_at",{ascending:true}),
  ]);
  const contract=contractResult.data;
  const member=memberResult.data;
  const allocations=(allocationResult.data??[]) as AllocationRow[];
  const events=(eventResult.data??[]) as EventRow[];
  let schedule:ScheduleRow[]=[];
  if(contract){
    const scheduleResult=await supabase.from("loan_installment_schedule").select("id,due_date,principal_amount,interest_amount,paid_principal_amount,paid_interest_amount,penalty_assessed_amount,paid_penalty_amount,penalty_waived_amount,status").eq("contract_id",contract.id).eq("organization_id",access.organization.id).order("installment_number",{ascending:true});
    schedule=(scheduleResult.data??[]) as ScheduleRow[];
  }
  const scheduleMap=new Map(schedule.map((item)=>[item.id,item]));
  const outstanding=schedule.reduce((sum,item)=>sum+Math.max(0,Number(item.principal_amount)-Number(item.paid_principal_amount))+Math.max(0,Number(item.interest_amount)-Number(item.paid_interest_amount))+Math.max(0,Number(item.penalty_assessed_amount)-Number(item.paid_penalty_amount)-Number(item.penalty_waived_amount)),0);
  const penaltyDue=schedule.reduce((sum,item)=>sum+Math.max(0,Number(item.penalty_assessed_amount)-Number(item.paid_penalty_amount)-Number(item.penalty_waived_amount)),0);
  const canPost=access.permissions.includes("LOAN_REPAYMENT_POST");
  const failure=errorMessage(query.error,query.detail);

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · DETAIL ANGSURAN</p><h1>{row.repayment_number}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/loans/repayments">← Daftar Angsuran</Link><span>STATUS</span><h2>{row.status}</h2><p>{contract?.contract_number||"Kontrak"} · {member?.member_number||"—"} · {member?.full_name||"Anggota"}</p></div><div className={styles.summaryCard}><span>PEMBAYARAN</span><strong>{money(row.total_amount)}</strong><small>{row.channel}</small></div></section>
      {query.status?<div className={styles.success}>Proses berhasil: {query.status.replace(/-/g," ")}.</div>:null}
      {failure?<div className={styles.error}>{failure}</div>:null}

      <section className={styles.detailGrid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>PAYMENT SNAPSHOT</span><h3>Nilai pembayaran</h3></div></div><dl className={styles.definition}>
          <div><dt>Kontrak</dt><dd>{contract?.contract_number||"—"}</dd></div><div><dt>Status kontrak</dt><dd>{contract?.status||"—"}</dd></div>
          <div><dt>Total</dt><dd>{money(row.total_amount)}</dd></div><div><dt>Referensi</dt><dd>{row.payment_reference}</dd></div>
          <div><dt>Denda</dt><dd>{money(row.penalty_amount)}</dd></div><div><dt>Bunga</dt><dd>{money(row.interest_amount)}</dd></div>
          <div><dt>Pokok</dt><dd>{money(row.principal_amount)}</dd></div><div><dt>Kanal</dt><dd>{row.channel}</dd></div>
          <div><dt>Treasury D1</dt><dd>{row.treasury_account_id}</dd></div><div><dt>Sisa kewajiban kini</dt><dd>{money(outstanding)}</dd></div>
          <div><dt>Denda terutang kini</dt><dd>{money(penaltyDue)}</dd></div><div className={styles.wide}><dt>Catatan</dt><dd>{row.request_note||"—"}</dd></div>
        </dl></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>EXECUTION</span><h3>D1 & idempotency</h3></div></div><dl className={styles.definition}>
          <div><dt>D1</dt><dd>{schema.current?"CURRENT":"BELUM CURRENT"}</dd></div><div><dt>Idempotency</dt><dd>{row.idempotency_key}</dd></div>
          <div><dt>Mulai proses</dt><dd>{time(row.execution_started_at)}</dd></div><div><dt>Posted</dt><dd>{time(row.posted_at)}</dd></div>
          <div><dt>D1 Journal</dt><dd>{row.d1_journal_entry_id||"—"}</dd></div><div><dt>Policy alokasi</dt><dd>PENALTY → INTEREST → PRINCIPAL · oldest first</dd></div>
          <div><dt>Event pokok</dt><dd>{row.principal_accounting_event_code}</dd></div><div><dt>Event bunga/denda</dt><dd>{row.interest_accounting_event_code} / {row.penalty_accounting_event_code}</dd></div>
        </dl>{row.d1_journal_entry_id?<Link className={styles.openLink} href={`/finance/journals/${row.d1_journal_entry_id}`}>Buka jurnal D1 →</Link>:null}</article>
      </section>

      {row.status==="DRAFT"&&canPost?<section className={styles.successGate}><strong>Allocation snapshot sudah dibekukan.</strong><p>Periksa pembagian di bawah. Jika tanggal berubah dan kontrak masih overdue dengan tarif denda aktif, posting akan diblok agar draft dibuat ulang dengan denda terbaru.</p><div className={styles.detailGrid}><form action={executeLoanRepaymentAction}><input type="hidden" name="repayment_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><PendingSubmitButton pendingLabel="Memposting…">Post Pembayaran</PendingSubmitButton></form><form action={cancelLoanRepaymentAction}><input type="hidden" name="repayment_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><input name="cancel_note" maxLength={500} placeholder="Catatan pembatalan (opsional)"/><PendingSubmitButton pendingLabel="Membatalkan…">Batalkan Draft</PendingSubmitButton></form></div></section>:null}
      {row.status==="PROCESSING"&&canPost?<section className={styles.successGate}><strong>Proses berada di status PROCESSING.</strong><p>Ini dapat berarti respons terputus setelah D1 memposting. Gunakan Retry; D1 akan mengembalikan journal yang sama bila posting sebelumnya sudah berhasil.</p><form action={executeLoanRepaymentAction}><input type="hidden" name="repayment_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><PendingSubmitButton pendingLabel="Merekonsiliasi…">Retry Pembayaran</PendingSubmitButton></form></section>:null}

      <section className={styles.panel}><div className={styles.panelHead}><div><span>ALLOCATION SNAPSHOT</span><h3>Pembagian ke jadwal</h3></div><b>{allocations.length}</b></div>
        {allocations.length?<div className={styles.tableWrap}><table><thead><tr><th>Periode</th><th>Jatuh tempo</th><th>Denda</th><th>Bunga</th><th>Pokok</th><th>Status jadwal kini</th></tr></thead><tbody>{allocations.map((allocation)=>{const item=scheduleMap.get(allocation.installment_id);return <tr key={allocation.id}><td><strong>#{allocation.installment_number}</strong></td><td>{item?.due_date||"—"}</td><td>{money(allocation.penalty_amount)}</td><td>{money(allocation.interest_amount)}</td><td>{money(allocation.principal_amount)}</td><td>{item?.status||"—"}</td></tr>;})}</tbody></table></div>:<div className={styles.empty}>Allocation belum tersedia.</div>}
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>AUDIT TRAIL</span><h3>Riwayat pembayaran</h3></div><b>{events.length}</b></div>{events.length?<div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Event</th><th>Transisi</th><th>Catatan</th><th>Aktor</th></tr></thead><tbody>{events.map((event)=><tr key={event.id}><td>{time(event.created_at)}</td><td><strong>{event.event_type}</strong></td><td>{event.from_status||"—"} → {event.to_status}</td><td>{event.note||"—"}</td><td><small>{event.actor_user_id}</small></td></tr>)}</tbody></table></div>:<div className={styles.empty}>Belum ada event.</div>}</section>

      <section className={styles.notice}><strong>4E-5B aktif</strong><p>Denda dan waiver kini bagian dari kewajiban kontrak. Reversal pembayaran, reschedule/restrukturisasi, dan settlement khusus tetap harus dibuat sebagai transaksi koreksi terpisah pada fase berikutnya.</p></section>
    </div>
  </section>;
}
