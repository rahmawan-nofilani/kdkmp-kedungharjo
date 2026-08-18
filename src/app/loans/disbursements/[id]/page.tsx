import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { createClient } from "@/lib/supabase/server";
import {
  cancelLoanDisbursementAction,
  decideLoanDisbursementAction,
  executeLoanDisbursementAction,
  submitLoanDisbursementAction,
} from "../actions";
import styles from "../../contracts/contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; status?: string; detail?: string }> };
type EventRow = { id:string;event_type:string;from_status:string|null;to_status:string;note:string|null;actor_user_id:string;created_at:string };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function time(value: string | null) {
  return value ? new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"}) : "—";
}
function errorMessage(code?: string, detail?: string) {
  const messages: Record<string,string> = {
    contract:"Kontrak tidak lagi READY.",duplicate:"Proses pencairan sudah ada.",channel:"Kanal pencairan tidak valid.",snapshot:"Snapshot produk belum memuat konfigurasi pencairan.",maker:"Maker tidak boleh menyetujui pencairannya sendiri.",reason:"Alasan penolakan minimal 5 karakter.",reference:"Referensi eksekusi wajib 3–120 karakter.","reference-mismatch":"Retry harus menggunakan referensi eksekusi yang sama.",forbidden:"Hak akses tidak tersedia.",payload:"Payload eksekusi tidak konsisten.",d1:"D1 belum CURRENT.",finalize:"D1 mungkin sudah memposting, tetapi finalisasi Supabase belum selesai. Jalankan Retry Eksekusi dengan referensi yang sama.",save:"Proses belum dapat disimpan.",
  };
  if (code === "d1-post") return `Posting D1 belum selesai${detail ? `: ${detail}` : "."} Retry dengan referensi yang sama aman karena idempotent.`;
  return code ? messages[code] || "Proses belum dapat diselesaikan." : null;
}

export default async function LoanDisbursementDetailPage({ params,searchParams }: PageProps) {
  const access=await getAccessContext();
  if(!access) redirect("/login");
  if(!access.permissions.includes("LOAN_DISBURSEMENT_VIEW")) redirect("/dashboard");
  const [{id},query,schema]=await Promise.all([params,searchParams,getD1SchemaStatus()]);
  const supabase=await createClient();
  const {data:row,error}=await supabase.from("loan_disbursements").select("*").eq("id",id).eq("organization_id",access.organization.id).maybeSingle();
  if(error||!row) notFound();
  const [contractResult,memberResult,eventResult]=await Promise.all([
    supabase.from("loan_contracts").select("id,contract_number,status,principal_amount,agreement_date,first_due_date,admin_fee_amount,provision_fee_amount").eq("id",row.contract_id).eq("organization_id",access.organization.id).maybeSingle(),
    supabase.from("members").select("member_number,full_name").eq("id",row.member_id).eq("organization_id",access.organization.id).maybeSingle(),
    supabase.from("loan_disbursement_events").select("id,event_type,from_status,to_status,note,actor_user_id,created_at").eq("disbursement_id",id).eq("organization_id",access.organization.id).order("created_at",{ascending:true}),
  ]);
  const contract=contractResult.data;
  const member=memberResult.data;
  const events=(eventResult.data??[]) as EventRow[];
  const canManage=access.permissions.includes("LOAN_DISBURSEMENT_MANAGE");
  const canApprove=access.permissions.includes("LOAN_DISBURSEMENT_APPROVE");
  const canExecute=access.permissions.includes("LOAN_DISBURSEMENT_EXECUTE");
  const ownMaker=row.created_by===access.user.id||row.submitted_by===access.user.id;
  const failure=errorMessage(query.error,query.detail);

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · DETAIL PENCAIRAN</p><h1>{row.disbursement_number}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/loans/disbursements">← Daftar Pencairan</Link><span>STATUS</span><h2>{row.status}</h2><p>{contract?.contract_number||"Kontrak"} · {member?.member_number||"—"} · {member?.full_name||row.recipient_name}</p></div><div className={styles.summaryCard}><span>NOMINAL CAIR</span><strong>{money(row.net_disbursement_amount)}</strong><small>{row.channel}</small></div></section>
      {query.status ? <div className={styles.success}>Proses berhasil: {query.status.replace(/-/g," ")}.</div> : null}
      {failure ? <div className={styles.error}>{failure}</div> : null}

      <section className={styles.detailGrid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>PERMINTAAN</span><h3>Tujuan & sumber dana</h3></div></div><dl className={styles.definition}>
          <div><dt>Kontrak</dt><dd>{contract?.contract_number||"—"}</dd></div><div><dt>Status kontrak</dt><dd>{contract?.status||"—"}</dd></div>
          <div><dt>Kanal</dt><dd>{row.channel}</dd></div><div><dt>Treasury D1</dt><dd>{row.treasury_account_id}</dd></div>
          <div><dt>Penerima</dt><dd>{row.recipient_name}</dd></div><div><dt>Bank tujuan</dt><dd>{row.bank_name||"—"}</dd></div>
          <div><dt>Rekening tujuan</dt><dd>{row.bank_account_number||"—"}</dd></div><div><dt>Event accounting</dt><dd>{row.accounting_event_code}</dd></div>
          <div><dt>Pokok kontrak</dt><dd>{money(row.gross_amount)}</dd></div><div><dt>Net pencairan</dt><dd>{money(row.net_disbursement_amount)}</dd></div>
          <div className={styles.wide}><dt>Catatan maker</dt><dd>{row.request_note||"—"}</dd></div>
        </dl></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>EKSEKUSI</span><h3>D1 & idempotency</h3></div></div><dl className={styles.definition}>
          <div><dt>D1</dt><dd>{schema.current?"CURRENT":"BELUM CURRENT"}</dd></div><div><dt>Idempotency</dt><dd>{row.idempotency_key}</dd></div>
          <div><dt>Referensi</dt><dd>{row.execution_reference||"—"}</dd></div><div><dt>D1 Journal</dt><dd>{row.d1_journal_entry_id||"—"}</dd></div>
          <div><dt>Diajukan</dt><dd>{time(row.submitted_at)}</dd></div><div><dt>Diputuskan</dt><dd>{time(row.decided_at)}</dd></div>
          <div><dt>Mulai eksekusi</dt><dd>{time(row.execution_started_at)}</dd></div><div><dt>Selesai cair</dt><dd>{time(row.disbursed_at)}</dd></div>
        </dl>{row.d1_journal_entry_id?<Link className={styles.openLink} href={`/finance/journals/${row.d1_journal_entry_id}`}>Buka jurnal D1 →</Link>:null}</article>
      </section>

      {row.status==="DRAFT"&&canManage?<section className={styles.panel}><div className={styles.panelHead}><div><span>MAKER GATE</span><h3>Ajukan untuk diperiksa</h3></div></div><div className={styles.detailGrid}><form action={submitLoanDisbursementAction}><input type="hidden" name="disbursement_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><p className={styles.formNote}>Setelah diajukan, checker yang berbeda harus memberi keputusan.</p><PendingSubmitButton pendingLabel="Mengajukan…">Ajukan Pencairan</PendingSubmitButton></form><form action={cancelLoanDisbursementAction}><input type="hidden" name="disbursement_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><input name="cancel_note" maxLength={500} placeholder="Catatan pembatalan (opsional)"/><PendingSubmitButton pendingLabel="Membatalkan…">Batalkan Draft</PendingSubmitButton></form></div></section>:null}

      {row.status==="SUBMITTED"?<section className={styles.panel}><div className={styles.panelHead}><div><span>CHECKER GATE</span><h3>Keputusan pencairan</h3></div><b>{ownMaker?"DIBUAT OLEH ANDA":"SIAP DIPERIKSA"}</b></div>{canApprove&&!ownMaker?<div className={styles.detailGrid}><form action={decideLoanDisbursementAction}><input type="hidden" name="disbursement_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><input type="hidden" name="decision" value="APPROVE"/><input name="decision_note" maxLength={500} placeholder="Catatan approval (opsional)"/><PendingSubmitButton pendingLabel="Menyetujui…">Setujui Pencairan</PendingSubmitButton></form><form action={decideLoanDisbursementAction}><input type="hidden" name="disbursement_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><input type="hidden" name="decision" value="REJECT"/><input name="decision_note" required minLength={5} maxLength={500} placeholder="Alasan penolakan"/><PendingSubmitButton pendingLabel="Menolak…">Tolak Pencairan</PendingSubmitButton></form></div>:<p className={styles.formNote}>Pencairan harus diperiksa oleh user lain yang memiliki LOAN_DISBURSEMENT_APPROVE.</p>}</section>:null}

      {(row.status==="APPROVED"||row.status==="PROCESSING")&&canExecute?<section className={styles.successGate}><strong>{row.status==="PROCESSING"?"Eksekusi dapat di-retry dengan aman.":"Pencairan sudah disetujui checker."}</strong><p>Executor akan memposting debit Piutang Pinjaman dan kredit Kas/Bank ke D1. Jika respons terputus, gunakan referensi yang sama; D1 idempotency mencegah double posting.</p><form action={executeLoanDisbursementAction}><input type="hidden" name="disbursement_id" value={row.id}/><input type="hidden" name="contract_id" value={row.contract_id}/><input name="execution_reference" required minLength={3} maxLength={120} defaultValue={row.execution_reference||""} placeholder={row.channel==="BANK_TRANSFER"?"Nomor referensi transfer bank":"Nomor voucher kas"}/><PendingSubmitButton pendingLabel="Memposting…">{row.status==="PROCESSING"?"Retry Eksekusi":"Eksekusi Pencairan"}</PendingSubmitButton></form></section>:null}

      <section className={styles.panel}><div className={styles.panelHead}><div><span>AUDIT TRAIL</span><h3>Riwayat status</h3></div><b>{events.length}</b></div>{events.length?<div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Event</th><th>Transisi</th><th>Catatan</th><th>Aktor</th></tr></thead><tbody>{events.map((event)=><tr key={event.id}><td>{time(event.created_at)}</td><td><strong>{event.event_type}</strong></td><td>{event.from_status||"—"} → {event.to_status}</td><td>{event.note||"—"}</td><td><small>{event.actor_user_id}</small></td></tr>)}</tbody></table></div>:<div className={styles.empty}>Belum ada event.</div>}</section>

      <section className={styles.notice}><strong>Boundary fase</strong><p>4E-4 mengaktifkan pencairan dan journal pokok ke kas/bank. Penerimaan angsuran, bunga, denda, pelunasan, serta rekonsiliasi pinjaman lengkap tetap berada di fase berikutnya.</p></section>
    </div>
  </section>;
}
