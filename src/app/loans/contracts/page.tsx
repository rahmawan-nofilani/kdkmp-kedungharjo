import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { createLoanContractAction } from "./actions";
import styles from "./contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string }> };
type ContractRow = { id: string; contract_number: string; application_id: string; member_id: string; status: string; principal_amount: number; tenor_months: number; agreement_date: string; first_due_date: string; total_interest_amount: number; created_at: string };
type ApplicationRow = { id: string; application_number: string; member_id: string; status: string; requested_principal_amount: number; requested_tenor_months: number; product_snapshot: Record<string, unknown> };
type MemberRow = { id: string; member_number: string; full_name: string };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function errorMessage(code?: string) {
  if (code === "invalid") return "Pilih pengajuan dan tanggal akad yang valid.";
  if (code === "not-approved") return "Pengajuan harus berstatus APPROVED sebelum kontrak dibuat.";
  if (code === "duplicate") return "Pengajuan tersebut sudah memiliki kontrak.";
  if (code === "snapshot") return "Snapshot produk belum lengkap untuk membentuk kontrak.";
  if (code === "schedule") return "Jadwal angsuran tidak dapat dibentuk secara deterministik.";
  if (code === "forbidden") return "Hak akses pembuatan kontrak tidak tersedia.";
  if (code === "save") return "Kontrak belum dapat disimpan.";
  return null;
}

export default async function LoanContractsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_CONTRACT_VIEW")) redirect("/dashboard");
  const query = await searchParams;
  const canManage = access.permissions.includes("LOAN_CONTRACT_MANAGE");
  const supabase = await createClient();

  const [contractResult, applicationResult, memberResult] = await Promise.all([
    supabase.from("loan_contracts").select("id,contract_number,application_id,member_id,status,principal_amount,tenor_months,agreement_date,first_due_date,total_interest_amount,created_at").eq("organization_id", access.organization.id).order("created_at", { ascending: false }).limit(120),
    supabase.from("loan_applications").select("id,application_number,member_id,status,requested_principal_amount,requested_tenor_months,product_snapshot").eq("organization_id", access.organization.id).eq("status", "APPROVED").order("reviewed_at", { ascending: false }).limit(120),
    supabase.from("members").select("id,member_number,full_name").eq("organization_id", access.organization.id),
  ]);

  const contracts = (contractResult.data ?? []) as ContractRow[];
  const applications = (applicationResult.data ?? []) as ApplicationRow[];
  const members = (memberResult.data ?? []) as MemberRow[];
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const contractedApplicationIds = new Set(contracts.map((contract) => contract.application_id));
  const availableApplications = applications.filter((application) => !contractedApplicationIds.has(application.id));
  const failure = errorMessage(query.error) || contractResult.error || applicationResult.error || memberResult.error
    ? errorMessage(query.error) || "Schema kontrak 4E-3 belum tersedia atau sebagian data belum dapat dibaca."
    : null;

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · KONTRAK</p><h1>Kontrak &amp; Jadwal Angsuran</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}>
        <div><span>FASE 4E-3 · KONTRAK</span><h2>Bekukan hasil persetujuan menjadi kontrak dan jadwal angsuran yang deterministik.</h2><p>Tahap ini belum mencairkan uang, belum membuat jurnal, dan belum menerima angsuran. Kontrak hanya membentuk kewajiban terjadwal dari pengajuan yang sudah disetujui.</p></div>
        {canManage ? <details className={styles.create}><summary>+ Bentuk Kontrak</summary>{availableApplications.length ? <form action={createLoanContractAction}>
          <label>Pengajuan disetujui<select name="application_id" required defaultValue=""><option value="" disabled>Pilih pengajuan APPROVED</option>{availableApplications.map((application) => {
            const member = memberMap.get(application.member_id);
            const productName = String(application.product_snapshot?.display_name || application.product_snapshot?.product_code || "Produk");
            return <option value={application.id} key={application.id}>{application.application_number} · {member?.full_name || "Anggota"} · {productName} · {money(application.requested_principal_amount)}</option>;
          })}</select></label>
          <label>Tanggal akad<input type="date" name="agreement_date" defaultValue={todayJakarta()} required /></label>
          <p className={styles.formNote}>Jadwal akan dihitung dari snapshot produk yang tersimpan pada saat eligibility. Perubahan produk setelah approval tidak mengubah kontrak ini.</p>
          <PendingSubmitButton pendingLabel="Membentuk kontrak…">Bentuk Kontrak &amp; Jadwal</PendingSubmitButton>
        </form> : <div className={styles.empty}><strong>Tidak ada pengajuan APPROVED yang belum memiliki kontrak.</strong><p>Selesaikan approval pengajuan terlebih dahulu.</p><Link href="/loans/applications">Buka Pengajuan Pinjaman</Link></div>}</details> : null}
      </section>

      {failure ? <div className={styles.error}>{failure}</div> : null}

      <section className={styles.metrics}>
        <article><span>Total kontrak</span><strong>{contracts.length}</strong><small>registry organisasi</small></article>
        <article><span>Siap dicairkan</span><strong>{contracts.filter((contract) => contract.status === "READY").length}</strong><small>belum ada pergerakan uang</small></article>
        <article><span>Menunggu kontrak</span><strong>{availableApplications.length}</strong><small>pengajuan APPROVED</small></article>
        <article><span>Pokok terkontrak</span><strong>{money(contracts.reduce((sum, contract) => sum + Number(contract.principal_amount || 0), 0))}</strong><small>belum dicairkan</small></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>REGISTRY SUPABASE</span><h3>Kontrak pinjaman organisasi</h3></div><b>{contracts.length}</b></div>
        {contracts.length ? <div className={styles.tableWrap}><table><thead><tr><th>Kontrak</th><th>Anggota</th><th>Pokok</th><th>Akad</th><th>Jatuh tempo pertama</th><th>Status</th><th></th></tr></thead><tbody>{contracts.map((contract) => {
          const member = memberMap.get(contract.member_id);
          return <tr key={contract.id}><td><strong>{contract.contract_number}</strong><small>{contract.tenor_months} bulan</small></td><td><strong>{member?.full_name || "Anggota"}</strong><small>{member?.member_number || "—"}</small></td><td><strong>{money(contract.principal_amount)}</strong><small>bunga total {money(contract.total_interest_amount)}</small></td><td>{new Date(`${contract.agreement_date}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC" })}</td><td>{new Date(`${contract.first_due_date}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC" })}</td><td><span className={styles.badge}>{contract.status === "READY" ? "SIAP DICAIRKAN" : contract.status}</span></td><td><Link className={styles.openLink} href={`/loans/contracts/${contract.id}`}>Buka</Link></td></tr>;
        })}</tbody></table></div> : <div className={styles.empty}><strong>Belum ada kontrak.</strong><p>Kontrak dibentuk hanya dari pengajuan APPROVED.</p></div>}
      </section>

      <section className={styles.notice}><strong>Pagar pengaman 4E-3</strong><p>Pembuatan kontrak tidak mengubah saldo D1, tidak mencairkan dana, tidak menulis jurnal, dan tidak mengaktifkan pembayaran POS dari simpanan.</p></section>
    </div>
  </section>;
}
