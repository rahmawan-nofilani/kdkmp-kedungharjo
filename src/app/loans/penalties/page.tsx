import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import {
  assessLoanPenaltyAction,
  cancelLoanPenaltyWaiverAction,
  createLoanPenaltyWaiverAction,
  decideLoanPenaltyWaiverAction,
  submitLoanPenaltyWaiverAction,
} from "./actions";
import styles from "../contracts/contracts.module.css";

export const dynamic="force-dynamic";

type PageProps={searchParams:Promise<{error?:string;status?:string}>};
type ContractRow={id:string;contract_number:string;member_id:string;status:string;product_snapshot:Record<string,unknown>};
type ScheduleRow={id:string;contract_id:string;installment_number:number;due_date:string;principal_amount:number;interest_amount:number;paid_principal_amount:number;paid_interest_amount:number;penalty_assessed_amount:number;paid_penalty_amount:number;penalty_waived_amount:number;penalty_assessed_through:string|null;status:string};
type WaiverRow={id:string;waiver_number:string;contract_id:string;installment_id:string;member_id:string;status:string;requested_amount:number;reason:string;decision_note:string|null;created_by:string;submitted_by:string|null;created_at:string;submitted_at:string|null};
type MemberRow={id:string;member_number:string;full_name:string};

function money(value:unknown){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value||0));}
function numberField(value:unknown,key:string){const object=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};return Number(object[key]||0);}
function errorMessage(code?:string){const messages:Record<string,string>={invalid:"Data waiver belum lengkap.",contract:"Kontrak tidak aktif untuk denda.",installment:"Periode angsuran tidak ditemukan.",amount:"Nominal waiver harus lebih dari nol.",reason:"Alasan waiver minimal 8 karakter.",exceeds:"Nominal waiver melebihi denda yang masih terutang.",pending:"Periode ini sudah memiliki waiver yang belum selesai.",repayment:"Selesaikan/batalkan draft pembayaran sebelum memproses waiver.",maker:"Maker tidak boleh menyetujui waiver yang dibuat/diajukannya sendiri.","reject-reason":"Penolakan membutuhkan alasan minimal 5 karakter.",state:"Status waiver sudah berubah dan aksi ini tidak lagi berlaku.",forbidden:"Hak akses denda/waiver tidak tersedia.",save:"Proses denda belum dapat disimpan."};return code?messages[code]||null:null;}

export default async function LoanPenaltiesPage({searchParams}:PageProps){
  const access=await getAccessContext();
  if(!access) redirect("/login");
  if(!access.permissions.includes("LOAN_PENALTY_VIEW")) redirect("/dashboard");
  const params=await searchParams;
  const canAssess=access.permissions.includes("LOAN_REPAYMENT_POST")||access.permissions.includes("LOAN_PENALTY_WAIVE_REQUEST");
  const canRequest=access.permissions.includes("LOAN_PENALTY_WAIVE_REQUEST");
  const canApprove=access.permissions.includes("LOAN_PENALTY_WAIVE_APPROVE");
  const supabase=await createClient();
  const [contractResult,scheduleResult,waiverResult,memberResult]=await Promise.all([
    supabase.from("loan_contracts").select("id,contract_number,member_id,status,product_snapshot").eq("organization_id",access.organization.id).in("status",["DISBURSED","CLOSED"]).order("created_at",{ascending:false}).limit(250),
    supabase.from("loan_installment_schedule").select("id,contract_id,installment_number,due_date,principal_amount,interest_amount,paid_principal_amount,paid_interest_amount,penalty_assessed_amount,paid_penalty_amount,penalty_waived_amount,penalty_assessed_through,status").eq("organization_id",access.organization.id).order("due_date",{ascending:true}).limit(1000),
    supabase.from("loan_penalty_waivers").select("id,waiver_number,contract_id,installment_id,member_id,status,requested_amount,reason,decision_note,created_by,submitted_by,created_at,submitted_at").eq("organization_id",access.organization.id).order("created_at",{ascending:false}).limit(250),
    supabase.from("members").select("id,member_number,full_name").eq("organization_id",access.organization.id),
  ]);
  const contracts=(contractResult.data??[]) as ContractRow[];
  const schedule=(scheduleResult.data??[]) as ScheduleRow[];
  const waivers=(waiverResult.data??[]) as WaiverRow[];
  const members=(memberResult.data??[]) as MemberRow[];
  const contractMap=new Map(contracts.map(row=>[row.id,row]));
  const memberMap=new Map(members.map(row=>[row.id,row]));
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const activeContracts=contracts.filter(row=>row.status==="DISBURSED"&&numberField(row.product_snapshot,"late_penalty_bps_per_day")>0);
  const penaltyRows=schedule.filter(row=>Number(row.penalty_assessed_amount||0)>0||Number(row.paid_penalty_amount||0)>0||Number(row.penalty_waived_amount||0)>0);
  const dueRows=penaltyRows.filter(row=>Math.max(0,Number(row.penalty_assessed_amount)-Number(row.paid_penalty_amount)-Number(row.penalty_waived_amount))>0);
  const openWaiverInstallments=new Set(waivers.filter(row=>row.status==="DRAFT"||row.status==="SUBMITTED").map(row=>row.installment_id));
  const totalAssessed=penaltyRows.reduce((sum,row)=>sum+Number(row.penalty_assessed_amount||0),0);
  const totalPaid=penaltyRows.reduce((sum,row)=>sum+Number(row.paid_penalty_amount||0),0);
  const totalWaived=penaltyRows.reduce((sum,row)=>sum+Number(row.penalty_waived_amount||0),0);
  const totalDue=Math.max(0,totalAssessed-totalPaid-totalWaived);
  const failure=errorMessage(params.error)||(scheduleResult.error||waiverResult.error?"Schema denda 4E-5B belum tersedia.":null);

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · DENDA & WAIVER</p><h1>Keterlambatan dan Denda</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}><div><span>PHASE 4E-5B · OVERDUE CONTROL</span><h2>Denda bertambah hanya untuk hari keterlambatan yang belum pernah dinilai.</h2><p>Basis denda adalah sisa pokok+bunga pada periode terlambat. Grace period dan tarif berasal dari snapshot kontrak. Waiver tidak menghapus histori: maker mengajukan, checker berbeda memutuskan, dan jumlah dibebaskan tercatat terpisah.</p></div><div><Link className={styles.openLink} href="/loans/repayments">Buka Angsuran →</Link></div></section>
      {params.status?<div className={styles.success}>Proses berhasil: {params.status.replace(/-/g," ")}.</div>:null}
      {failure?<div className={styles.error}>{failure}</div>:null}

      <section className={styles.metrics}>
        <article><span>Denda dinilai</span><strong>{money(totalAssessed)}</strong><small>cumulative assessment</small></article>
        <article><span>Denda dibayar</span><strong>{money(totalPaid)}</strong><small>posted via repayment</small></article>
        <article><span>Denda di-waive</span><strong>{money(totalWaived)}</strong><small>checker-approved</small></article>
        <article><span>Denda terutang</span><strong>{money(totalDue)}</strong><small>{dueRows.length} periode</small></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>ASSESSMENT</span><h3>Perbarui denda kontrak aktif</h3></div><b>{activeContracts.length}</b></div>
        {activeContracts.length?<div className={styles.tableWrap}><table><thead><tr><th>Kontrak</th><th>Anggota</th><th>Grace</th><th>Tarif/hari</th><th>Minimum</th><th></th></tr></thead><tbody>{activeContracts.map(contract=>{const member=memberMap.get(contract.member_id);return <tr key={contract.id}><td><strong>{contract.contract_number}</strong></td><td>{member?.member_number||"—"} · {member?.full_name||"Anggota"}</td><td>{numberField(contract.product_snapshot,"grace_period_days")} hari</td><td>{(numberField(contract.product_snapshot,"late_penalty_bps_per_day")/100).toLocaleString("id-ID",{maximumFractionDigits:2})}%</td><td>{money(numberField(contract.product_snapshot,"late_penalty_min_amount"))}</td><td>{canAssess?<form action={assessLoanPenaltyAction}><input type="hidden" name="contract_id" value={contract.id}/><PendingSubmitButton pendingLabel="Menghitung…">Perbarui Denda</PendingSubmitButton></form>:null}</td></tr>;})}</tbody></table></div>:<div className={styles.empty}><strong>Tidak ada kontrak dengan denda aktif.</strong><p>Produk aktif yang tarif dendanya 0 tidak menghasilkan assessment.</p></div>}
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>DENDA PER PERIODE</span><h3>Assessment, pembayaran, dan pembebasan</h3></div><b>{penaltyRows.length}</b></div>
        {penaltyRows.length?<div className={styles.tableWrap}><table><thead><tr><th>Kontrak / Periode</th><th>Jatuh tempo</th><th>Dinilai s.d.</th><th>Dinilai</th><th>Dibayar</th><th>Waiver</th><th>Terutang</th><th>Aksi</th></tr></thead><tbody>{penaltyRows.map(row=>{const contract=contractMap.get(row.contract_id);const member=contract?memberMap.get(contract.member_id):undefined;const due=Math.max(0,Number(row.penalty_assessed_amount)-Number(row.paid_penalty_amount)-Number(row.penalty_waived_amount));const open=openWaiverInstallments.has(row.id);return <tr key={row.id}><td><strong>{contract?.contract_number||"Kontrak"} · #{row.installment_number}</strong><small>{member?.full_name||"Anggota"}</small></td><td>{row.due_date}</td><td>{row.penalty_assessed_through||"—"}{row.penalty_assessed_through&&row.penalty_assessed_through<today?<small> · perlu refresh bila masih overdue</small>:null}</td><td>{money(row.penalty_assessed_amount)}</td><td>{money(row.paid_penalty_amount)}</td><td>{money(row.penalty_waived_amount)}</td><td><strong>{money(due)}</strong></td><td>{canRequest&&due>0&&!open?<details><summary>Ajukan waiver</summary><form action={createLoanPenaltyWaiverAction}><input type="hidden" name="installment_id" value={row.id}/><label>Nominal<input type="number" name="requested_amount" min="1" max={due} step="1" required/></label><label>Alasan<input name="reason" minLength={8} maxLength={500} required placeholder="Alasan operasional yang dapat diaudit"/></label><PendingSubmitButton pendingLabel="Membuat…">Buat Draft Waiver</PendingSubmitButton></form></details>:open?<small>Waiver sedang diproses</small>:"—"}</td></tr>;})}</tbody></table></div>:<div className={styles.empty}><strong>Belum ada denda yang dinilai.</strong><p>Klik Perbarui Denda pada kontrak yang memakai tarif denda, atau buat pembayaran; repayment juga menilai denda sampai tanggal transaksi.</p></div>}
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>WAIVER MAKER-CHECKER</span><h3>Permohonan pembebasan denda</h3></div><b>{waivers.length}</b></div>
        {waivers.length?<div className={styles.tableWrap}><table><thead><tr><th>No.</th><th>Kontrak</th><th>Nominal</th><th>Alasan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{waivers.map(row=>{const contract=contractMap.get(row.contract_id);const own=row.created_by===access.user.id||row.submitted_by===access.user.id;return <tr id={`waiver-${row.id}`} key={row.id}><td><strong>{row.waiver_number}</strong><small>{new Date(row.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</small></td><td>{contract?.contract_number||"Kontrak"}</td><td><strong>{money(row.requested_amount)}</strong></td><td>{row.reason}{row.decision_note?<small>Keputusan: {row.decision_note}</small>:null}</td><td><span className={styles.badge}>{row.status}</span></td><td>{row.status==="DRAFT"&&canRequest&&row.created_by===access.user.id?<div><form action={submitLoanPenaltyWaiverAction}><input type="hidden" name="waiver_id" value={row.id}/><PendingSubmitButton pendingLabel="Mengajukan…">Ajukan</PendingSubmitButton></form><form action={cancelLoanPenaltyWaiverAction}><input type="hidden" name="waiver_id" value={row.id}/><PendingSubmitButton pendingLabel="Membatalkan…">Batalkan</PendingSubmitButton></form></div>:row.status==="SUBMITTED"&&canApprove&&!own?<div><form action={decideLoanPenaltyWaiverAction}><input type="hidden" name="waiver_id" value={row.id}/><input type="hidden" name="decision" value="APPROVE"/><input name="decision_note" maxLength={500} placeholder="Catatan approval (opsional)"/><PendingSubmitButton pendingLabel="Menyetujui…">Setujui</PendingSubmitButton></form><form action={decideLoanPenaltyWaiverAction}><input type="hidden" name="waiver_id" value={row.id}/><input type="hidden" name="decision" value="REJECT"/><input name="decision_note" minLength={5} maxLength={500} required placeholder="Alasan penolakan"/><PendingSubmitButton pendingLabel="Menolak…">Tolak</PendingSubmitButton></form></div>:row.status==="SUBMITTED"&&own?<small>Menunggu checker berbeda</small>:"—"}</td></tr>;})}</tbody></table></div>:<div className={styles.empty}><strong>Belum ada waiver.</strong><p>Pembebasan denda hanya dapat dibuat terhadap denda yang sudah dinilai dan masih terutang.</p></div>}
      </section>

      <section className={styles.notice}><strong>Aturan yang dibekukan</strong><p>Assessment tidak menghitung ulang hari lama. Sistem menyimpan tanggal assessment terakhir dan carry pecahan rupiah. Setelah pembayaran partial, assessment berikutnya memakai sisa pokok+bunga yang lebih rendah. Waiver tidak mengubah nilai denda historis; ia dicatat sebagai jumlah dibebaskan.</p></section>
    </div>
  </section>;
}
