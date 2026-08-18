import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import { createClient } from "@/lib/supabase/server";
import { createLoanRepaymentAction } from "./actions";
import styles from "../contracts/contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string; status?: string }> };
type RepaymentRow = {
  id:string;repayment_number:string;contract_id:string;member_id:string;status:string;channel:string;
  total_amount:number;principal_amount:number;interest_amount:number;penalty_amount:number;payment_reference:string;
  created_at:string;posted_at:string|null;
};
type ContractRow = { id:string;contract_number:string;member_id:string;status:string;principal_amount:number;product_snapshot:Record<string,unknown> };
type ScheduleRow = { contract_id:string;principal_amount:number;interest_amount:number;paid_principal_amount:number;paid_interest_amount:number;penalty_assessed_amount:number;paid_penalty_amount:number;penalty_waived_amount:number };
type MemberRow = { id:string;member_number:string;full_name:string };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function errorMessage(code?: string) {
  const messages: Record<string,string> = {
    invalid: "Data pembayaran belum lengkap atau nominal tidak valid.",
    d1: "D1 belum CURRENT sehingga kas/bank belum aman untuk menerima angsuran.",
    treasury: "Kanal pembayaran tidak cocok dengan tipe treasury yang dipilih.",
    contract: "Kontrak harus berstatus DISBURSED untuk menerima angsuran.",
    pending: "Kontrak masih memiliki draft/proses pembayaran yang belum selesai. Selesaikan atau batalkan proses tersebut terlebih dahulu.",
    waiver: "Kontrak masih memiliki waiver denda yang belum selesai. Selesaikan waiver sebelum membuat pembayaran.",
    penalty: "Snapshot denda pembayaran sudah kedaluwarsa karena hari keterlambatan bertambah. Batalkan draft dan buat ulang agar denda terbaru masuk ke alokasi.",
    overpay: "Nominal pembayaran melebihi seluruh sisa kewajiban kontrak, termasuk denda yang sudah dinilai.",
    amount: "Nominal pembayaran tidak valid.",
    channel: "Kanal pembayaran tidak diizinkan.",
    snapshot: "Snapshot produk belum memuat kanal/event accounting pembayaran terbaru.",
    reference: "Referensi pembayaran harus 3–120 karakter.",
    forbidden: "Hak akses posting angsuran tidak tersedia.",
    save: "Pembayaran belum dapat disimpan.",
  };
  return code ? messages[code] || null : null;
}

function snapshotChannels(value: unknown) {
  const snapshot = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
  return Array.isArray(snapshot.repayment_channels) ? snapshot.repayment_channels.map(String).filter(Boolean) : [];
}

export default async function LoanRepaymentsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_REPAYMENT_VIEW")) redirect("/dashboard");
  const params = await searchParams;
  const canPost = access.permissions.includes("LOAN_REPAYMENT_POST");
  const schema = await getD1SchemaStatus();
  let treasuryAccounts: Awaited<ReturnType<typeof listTreasuryAccounts>> = [];
  if (schema.current && schema.features.treasuryPeriod) {
    try { treasuryAccounts = (await listTreasuryAccounts(access.organization.id)).filter((row) => row.status === "ACTIVE"); }
    catch { treasuryAccounts = []; }
  }

  const supabase = await createClient();
  const [repaymentResult, contractResult, memberResult] = await Promise.all([
    supabase.from("loan_repayments").select("id,repayment_number,contract_id,member_id,status,channel,total_amount,principal_amount,interest_amount,penalty_amount,payment_reference,created_at,posted_at").eq("organization_id",access.organization.id).order("created_at",{ascending:false}).limit(200),
    supabase.from("loan_contracts").select("id,contract_number,member_id,status,principal_amount,product_snapshot").eq("organization_id",access.organization.id).eq("status","DISBURSED").order("created_at",{ascending:false}).limit(200),
    supabase.from("members").select("id,member_number,full_name").eq("organization_id",access.organization.id),
  ]);
  const repayments=(repaymentResult.data??[]) as RepaymentRow[];
  const contracts=(contractResult.data??[]) as ContractRow[];
  const members=(memberResult.data??[]) as MemberRow[];
  const memberMap=new Map(members.map((member)=>[member.id,member]));

  let schedule: ScheduleRow[] = [];
  if (contracts.length) {
    const scheduleResult = await supabase.from("loan_installment_schedule")
      .select("contract_id,principal_amount,interest_amount,paid_principal_amount,paid_interest_amount,penalty_assessed_amount,paid_penalty_amount,penalty_waived_amount")
      .eq("organization_id",access.organization.id)
      .in("contract_id",contracts.map((row)=>row.id));
    schedule=(scheduleResult.data??[]) as ScheduleRow[];
  }
  const outstandingMap=new Map<string,number>();
  const penaltyDueMap=new Map<string,number>();
  for(const row of schedule){
    const penaltyDue=Math.max(0,Number(row.penalty_assessed_amount||0)-Number(row.paid_penalty_amount||0)-Number(row.penalty_waived_amount||0));
    const outstanding=Math.max(0,Number(row.principal_amount||0)-Number(row.paid_principal_amount||0))
      +Math.max(0,Number(row.interest_amount||0)-Number(row.paid_interest_amount||0))+penaltyDue;
    outstandingMap.set(row.contract_id,(outstandingMap.get(row.contract_id)||0)+outstanding);
    penaltyDueMap.set(row.contract_id,(penaltyDueMap.get(row.contract_id)||0)+penaltyDue);
  }
  const pendingContracts=new Set(repayments.filter((row)=>row.status==="DRAFT"||row.status==="PROCESSING").map((row)=>row.contract_id));
  const availableContracts=contracts.filter((row)=>(outstandingMap.get(row.id)||0)>0&&!pendingContracts.has(row.id));
  const failure=errorMessage(params.error)||(repaymentResult.error?"Schema angsuran belum tersedia.":null);

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · ANGSURAN</p><h1>Penerimaan Angsuran</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}>
        <div><span>PHASE 4E-5B · REPAYMENT + PENALTY</span><h2>Pembayaran dibagi ke denda, lalu bunga, lalu pokok—periode tertua terlebih dahulu.</h2><p>Sebelum draft dibuat, Supabase menilai tambahan denda sampai tanggal transaksi. D1 kemudian mendebit Kas/Bank dan mengkredit Piutang, Pendapatan Bunga, serta Pendapatan Denda sesuai allocation snapshot yang dibekukan.</p></div>
        <div><Link className={styles.openLink} href="/loans/penalties">Denda &amp; Waiver →</Link></div>
        {canPost ? <details className={styles.create}><summary>+ Catat Pembayaran</summary>
          {availableContracts.length&&treasuryAccounts.length?<form action={createLoanRepaymentAction}>
            <label>Kontrak aktif<select name="contract_id" required defaultValue=""><option value="" disabled>Pilih kontrak</option>{availableContracts.map((contract)=>{const member=memberMap.get(contract.member_id);const channels=snapshotChannels(contract.product_snapshot);const penalty=penaltyDueMap.get(contract.id)||0;return <option key={contract.id} value={contract.id}>{contract.contract_number} · {member?.full_name||"Anggota"} · Sisa tersimpan {money(outstandingMap.get(contract.id)||0)}{penalty?` · Denda ${money(penalty)}`:""} · {channels.join("/")||"snapshot lama"}</option>;})}</select></label>
            <label>Nominal diterima<input type="number" name="amount" min="1" step="1" required placeholder="0" /></label>
            <label>Kanal<select name="channel" required defaultValue="CASH"><option value="CASH">CASH</option><option value="BANK_TRANSFER">BANK_TRANSFER</option><option value="QRIS">QRIS</option></select></label>
            <label>Kas / Bank penerima<select name="treasury_account_id" required defaultValue=""><option value="" disabled>Pilih treasury</option>{treasuryAccounts.map((account)=><option key={account.id} value={account.id}>{account.account_type} · {account.code} · {account.name}</option>)}</select></label>
            <label>Referensi pembayaran<input name="payment_reference" required minLength={3} maxLength={120} placeholder="No. kuitansi / transfer / QRIS" /></label>
            <label>Catatan<input name="request_note" maxLength={500} placeholder="Opsional" /></label>
            <p className={styles.formNote}>Sisa pada pilihan kontrak adalah snapshot tersimpan. Saat draft dibuat, sistem otomatis menilai denda terbaru terlebih dahulu. Jika ada waiver DRAFT/SUBMITTED, pembayaran diblok sampai waiver selesai agar alokasi tidak berubah di tengah proses.</p>
            <PendingSubmitButton pendingLabel="Menilai denda & menghitung alokasi…">Buat Draft Pembayaran</PendingSubmitButton>
          </form>:<div className={styles.empty}><strong>Belum ada kontrak/sumber pembayaran yang siap.</strong><p>Butuh kontrak DISBURSED dengan sisa kewajiban dan D1 Kas/Bank CURRENT.</p></div>}
        </details>:null}
      </section>

      {params.status?<div className={styles.success}>Proses berhasil: {params.status.replace(/-/g," ")}.</div>:null}
      {failure?<div className={styles.error}>{failure}</div>:null}
      {!schema.current?<div className={styles.error}>D1 belum CURRENT. Posting angsuran diblok sampai schema D1 lengkap.</div>:null}

      <section className={styles.metrics}>
        <article><span>Kontrak aktif</span><strong>{contracts.length}</strong><small>status DISBURSED</small></article>
        <article><span>Denda terutang tersimpan</span><strong>{money(Array.from(penaltyDueMap.values()).reduce((a,b)=>a+b,0))}</strong><small>refresh saat draft dibuat</small></article>
        <article><span>Pembayaran posted</span><strong>{repayments.filter((row)=>row.status==="POSTED").length}</strong><small>journal D1 tersedia</small></article>
        <article><span>Total diterima</span><strong>{money(repayments.filter((row)=>row.status==="POSTED").reduce((sum,row)=>sum+Number(row.total_amount||0),0))}</strong><small>registry organisasi</small></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>REGISTRY ANGSURAN</span><h3>Payment → allocation → journal</h3></div><b>{repayments.length}</b></div>
        {repayments.length?<div className={styles.tableWrap}><table><thead><tr><th>No.</th><th>Anggota</th><th>Kanal</th><th>Nominal</th><th>Alokasi</th><th>Status</th><th></th></tr></thead><tbody>{repayments.map((row)=>{const member=memberMap.get(row.member_id);return <tr key={row.id}><td><strong>{row.repayment_number}</strong><small>{new Date(row.posted_at||row.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</small></td><td><strong>{member?.full_name||"Anggota"}</strong><small>{member?.member_number||"—"}</small></td><td>{row.channel}</td><td><strong>{money(row.total_amount)}</strong><small>{row.payment_reference}</small></td><td><small>Denda {money(row.penalty_amount)}</small><small>Bunga {money(row.interest_amount)}</small><small>Pokok {money(row.principal_amount)}</small></td><td><span className={styles.badge}>{row.status}</span></td><td><Link className={styles.openLink} href={`/loans/repayments/${row.id}`}>Buka</Link></td></tr>;})}</tbody></table></div>:<div className={styles.empty}><strong>Belum ada pembayaran.</strong><p>Kontrak DISBURSED dapat menerima CASH/BANK_TRANSFER/QRIS sesuai snapshot produk.</p></div>}
      </section>

      <section className={styles.notice}><strong>Kontrol denda 4E-5B</strong><p>Denda tidak dihitung ulang dari hari pertama. Sistem hanya menambah hari yang belum pernah dinilai dan menyimpan pecahan rupiah sebagai carry. Partial payment otomatis menurunkan basis denda pada assessment berikutnya. Waiver harus melalui maker-checker.</p></section>
    </div>
  </section>;
}
