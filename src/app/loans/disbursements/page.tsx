import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import { createClient } from "@/lib/supabase/server";
import { createLoanDisbursementAction } from "./actions";
import styles from "../contracts/contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string; status?: string }> };
type DisbursementRow = { id:string;disbursement_number:string;contract_id:string;member_id:string;status:string;channel:string;gross_amount:number;net_disbursement_amount:number;recipient_name:string;created_at:string };
type ContractRow = { id:string;contract_number:string;member_id:string;status:string;principal_amount:number;product_snapshot:Record<string,unknown> };
type MemberRow = { id:string;member_number:string;full_name:string };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function errorMessage(code?: string) {
  const messages: Record<string,string> = {
    invalid: "Data permintaan pencairan belum lengkap.",
    d1: "D1 belum CURRENT sehingga kas/bank belum aman untuk pencairan.",
    treasury: "Kanal pencairan tidak cocok dengan tipe treasury yang dipilih.",
    bank: "Transfer bank membutuhkan nama bank dan nomor rekening tujuan.",
    contract: "Kontrak harus berstatus READY sebelum pencairan dibuat.",
    duplicate: "Kontrak tersebut sudah memiliki proses pencairan.",
    channel: "Kanal pencairan tidak valid.",
    snapshot: "Snapshot produk belum memuat konfigurasi pencairan. Evaluasi produk/pengajuan harus menggunakan schema terbaru.",
    forbidden: "Hak akses pencairan tidak tersedia.",
    save: "Permintaan pencairan belum dapat disimpan.",
  };
  return code ? messages[code] || null : null;
}

function snapshotChannels(value: unknown) {
  const snapshot = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
  return Array.isArray(snapshot.disbursement_channels) ? snapshot.disbursement_channels.map(String).filter(Boolean) : [];
}

export default async function LoanDisbursementsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_DISBURSEMENT_VIEW")) redirect("/dashboard");
  const params = await searchParams;
  const canManage = access.permissions.includes("LOAN_DISBURSEMENT_MANAGE");
  const schema = await getD1SchemaStatus();
  let treasuryAccounts: Awaited<ReturnType<typeof listTreasuryAccounts>> = [];
  if (schema.current && schema.features.treasuryPeriod) {
    try { treasuryAccounts = (await listTreasuryAccounts(access.organization.id)).filter((row) => row.status === "ACTIVE"); }
    catch { treasuryAccounts = []; }
  }

  const supabase = await createClient();
  const [disbursementResult, contractResult, memberResult] = await Promise.all([
    supabase.from("loan_disbursements").select("id,disbursement_number,contract_id,member_id,status,channel,gross_amount,net_disbursement_amount,recipient_name,created_at").eq("organization_id",access.organization.id).order("created_at",{ascending:false}).limit(150),
    supabase.from("loan_contracts").select("id,contract_number,member_id,status,principal_amount,product_snapshot").eq("organization_id",access.organization.id).eq("status","READY").order("created_at",{ascending:false}).limit(150),
    supabase.from("members").select("id,member_number,full_name").eq("organization_id",access.organization.id),
  ]);
  const disbursements=(disbursementResult.data??[]) as DisbursementRow[];
  const contracts=(contractResult.data??[]) as ContractRow[];
  const members=(memberResult.data??[]) as MemberRow[];
  const memberMap=new Map(members.map((member)=>[member.id,member]));
  const usedContracts=new Set(disbursements.map((row)=>row.contract_id));
  const availableContracts=contracts.filter((row)=>!usedContracts.has(row.id));
  const queryFailure=errorMessage(params.error);
  const schemaFailure=disbursementResult.error ? "Schema pencairan 4E-4 belum tersedia." : null;
  const failure=queryFailure||schemaFailure;

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · PENCAIRAN</p><h1>Pencairan Pinjaman</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}>
        <div><span>PHASE 4E-4 · DISBURSEMENT</span><h2>Uang hanya keluar setelah kontrak READY, maker-checker selesai, dan executor memposting ke D1.</h2><p>Supabase menyimpan workflow dan audit. D1 menjadi sumber kas/bank serta journal posting. Retry memakai idempotency key tetap sehingga pencairan yang sama tidak diposting dua kali.</p></div>
        {canManage ? <details className={styles.create}><summary>+ Buat Permintaan Pencairan</summary>
          {availableContracts.length && treasuryAccounts.length ? <form action={createLoanDisbursementAction}>
            <label>Kontrak READY<select name="contract_id" required defaultValue=""><option value="" disabled>Pilih kontrak</option>{availableContracts.map((contract)=>{const member=memberMap.get(contract.member_id);const channels=snapshotChannels(contract.product_snapshot);return <option key={contract.id} value={contract.id}>{contract.contract_number} · {member?.full_name||"Anggota"} · {money(contract.principal_amount)} · {channels.join("/")||"snapshot lama"}</option>;})}</select></label>
            <label>Kanal<select name="channel" required defaultValue="CASH"><option value="CASH">CASH</option><option value="BANK_TRANSFER">BANK_TRANSFER</option></select></label>
            <label>Kas / Bank sumber<select name="treasury_account_id" required defaultValue=""><option value="" disabled>Pilih treasury</option>{treasuryAccounts.map((account)=><option key={account.id} value={account.id}>{account.account_type} · {account.code} · {account.name} · {money(account.balance_amount)}</option>)}</select></label>
            <label>Nama penerima<input name="recipient_name" required minLength={3} maxLength={160} placeholder="Nama anggota / penerima sah" /></label>
            <label>Nama bank tujuan<input name="bank_name" maxLength={100} placeholder="Wajib untuk BANK_TRANSFER" /></label>
            <label>Nomor rekening tujuan<input name="bank_account_number" maxLength={80} placeholder="Wajib untuk BANK_TRANSFER" /></label>
            <label>Catatan permintaan<input name="request_note" maxLength={500} placeholder="Opsional" /></label>
            <p className={styles.formNote}>Nominal pencairan 4E-4 mengikuti pokok kontrak. Biaya admin/provisi tidak dipotong otomatis karena produk belum memiliki kebijakan metode pemotongan biaya.</p>
            <PendingSubmitButton pendingLabel="Membuat…">Buat Draft Pencairan</PendingSubmitButton>
          </form> : <div className={styles.empty}><strong>Belum ada sumber untuk pencairan.</strong><p>Pastikan ada kontrak READY dan D1 Kas/Bank CURRENT.</p></div>}
        </details> : null}
      </section>

      {params.status ? <div className={styles.success}>Proses berhasil: {params.status.replace(/-/g," ")}.</div> : null}
      {failure ? <div className={styles.error}>{failure}</div> : null}
      {!schema.current ? <div className={styles.error}>D1 belum CURRENT. Eksekusi pencairan diblok sampai schema D1 lengkap.</div> : null}

      <section className={styles.metrics}>
        <article><span>Total proses</span><strong>{disbursements.length}</strong><small>registry organisasi</small></article>
        <article><span>Menunggu checker</span><strong>{disbursements.filter((row)=>row.status==="SUBMITTED").length}</strong><small>maker-checker</small></article>
        <article><span>Siap dieksekusi</span><strong>{disbursements.filter((row)=>row.status==="APPROVED"||row.status==="PROCESSING").length}</strong><small>retry-safe</small></article>
        <article><span>Sudah dicairkan</span><strong>{money(disbursements.filter((row)=>row.status==="DISBURSED").reduce((sum,row)=>sum+Number(row.net_disbursement_amount||0),0))}</strong><small>posted ke D1</small></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>REGISTRY PENCAIRAN</span><h3>Workflow kontrak → kas/bank</h3></div><b>{disbursements.length}</b></div>
        {disbursements.length ? <div className={styles.tableWrap}><table><thead><tr><th>No.</th><th>Anggota</th><th>Kanal</th><th>Nominal</th><th>Status</th><th></th></tr></thead><tbody>{disbursements.map((row)=>{const member=memberMap.get(row.member_id);return <tr key={row.id}><td><strong>{row.disbursement_number}</strong><small>{new Date(row.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</small></td><td><strong>{member?.full_name||row.recipient_name}</strong><small>{member?.member_number||"—"}</small></td><td>{row.channel}</td><td><strong>{money(row.net_disbursement_amount)}</strong></td><td><span className={styles.badge}>{row.status}</span></td><td><Link className={styles.openLink} href={`/loans/disbursements/${row.id}`}>Buka</Link></td></tr>;})}</tbody></table></div> : <div className={styles.empty}><strong>Belum ada permintaan pencairan.</strong><p>Kontrak READY dapat dibuatkan draft pencairan oleh maker.</p></div>}
      </section>

      <section className={styles.notice}><strong>Pagar pengaman 4E-4</strong><p>Tidak ada pembayaran dari saldo simpanan. Pencairan hanya melalui CASH atau BANK_TRANSFER yang diizinkan snapshot produk, dan kas/bank D1 harus memiliki saldo cukup. Journal dibuat saat eksekusi, bukan saat approval.</p></section>
    </div>
  </section>;
}
