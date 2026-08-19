import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { createLoanApplicationAction } from "./actions";
import styles from "./applications.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string }> };
type MemberRow = { id: string; member_number: string; full_name: string; status: string };
type VersionRow = { id: string; version: number; status: string; display_name: string; min_principal_amount: number; max_principal_amount: number; min_tenor_months: number; max_tenor_months: number };
type ProductRow = { id: string; code: string; status: string; current_approved_version: number; loan_product_versions: VersionRow[] };
type ApplicationRow = { id: string; application_number: string; member_id: string; product_id: string; status: string; eligibility_status: string; requested_principal_amount: number; requested_tenor_months: number; created_by: string; created_at: string; submitted_at: string | null };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function errorMessage(code?: string) {
  if (code === "invalid") return "Data pengajuan belum lengkap atau formatnya tidak valid.";
  if (code === "duplicate") return "Anggota sudah memiliki draft untuk produk yang sama.";
  if (code === "active-limit") return "Batas komitmen aktif anggota sudah tercapai.";
  if (code === "save") return "Pengajuan belum dapat disimpan. Periksa anggota dan aturan produk.";
  return null;
}

function statusLabel(status: string) {
  return ({ DRAFT: "DRAFT", SUBMITTED: "MENUNGGU", UNDER_REVIEW: "DIPERIKSA", APPROVED: "DISETUJUI", REJECTED: "DITOLAK", CANCELLED: "DIBATALKAN" } as Record<string, string>)[status] || status;
}

export default async function LoanApplicationsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_APPLICATION_VIEW")) redirect("/dashboard");
  const params = await searchParams;
  const canManage = access.permissions.includes("LOAN_APPLICATION_MANAGE");
  const supabase = await createClient();

  const [applicationResult, memberResult, productResult] = await Promise.all([
    supabase.from("loan_applications").select("id,application_number,member_id,product_id,status,eligibility_status,requested_principal_amount,requested_tenor_months,created_by,created_at,submitted_at").eq("organization_id", access.organization.id).order("created_at", { ascending: false }).limit(120),
    supabase.from("members").select("id,member_number,full_name,status").eq("organization_id", access.organization.id).order("member_number", { ascending: true }),
    supabase.from("loan_products").select("id,code,status,current_approved_version,loan_product_versions(id,version,status,display_name,min_principal_amount,max_principal_amount,min_tenor_months,max_tenor_months)").eq("organization_id", access.organization.id).order("code", { ascending: true }),
  ]);
  const applications = (applicationResult.data ?? []) as ApplicationRow[];
  const members = (memberResult.data ?? []) as MemberRow[];
  const products = (productResult.data ?? []) as ProductRow[];
  const activeMembers = members.filter((member) => member.status === "ACTIVE");
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const choices = products.filter((product) => product.status === "ACTIVE").flatMap((product) => product.loan_product_versions
    .filter((version) => version.status === "APPROVED" && version.version === product.current_approved_version)
    .map((version) => ({ ...version, productCode: product.code })));
  const metrics = applications.reduce((summary, application) => {
    summary.total += 1;
    if (application.status === "DRAFT") summary.draft += 1;
    if (application.status === "SUBMITTED" || application.status === "UNDER_REVIEW") summary.waiting += 1;
    if (application.status === "APPROVED") summary.approved += 1;
    return summary;
  }, { total: 0, draft: 0, waiting: 0, approved: 0 });
  const failure = errorMessage(params.error) || applicationResult.error || memberResult.error || productResult.error
    ? errorMessage(params.error) || "Sebagian data pengajuan belum dapat dibaca."
    : null;

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · PENGAJUAN</p><h1>Pengajuan Pinjaman</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}>
        <div><span>FASE 4E-2 · KELAYAKAN</span><h2>Uji aturan produk, keanggotaan, saldo simpanan, dan kemampuan bayar sebelum diperiksa.</h2><p>Persetujuan pada tahap ini belum membuat kontrak, jadwal, pencairan, jurnal, atau pembayaran dari saldo simpanan/POS.</p></div>
        {canManage ? <details className={styles.create}><summary>+ Buat Pengajuan</summary>{activeMembers.length && choices.length ? <form action={createLoanApplicationAction}>
          <label>Anggota<select name="member_id" required defaultValue=""><option value="" disabled>Pilih anggota ACTIVE</option>{activeMembers.map((member) => <option value={member.id} key={member.id}>{member.member_number} · {member.full_name}</option>)}</select></label>
          <label>Produk &amp; versi<select name="product_version_id" required defaultValue=""><option value="" disabled>Pilih versi APPROVED</option>{choices.map((version) => <option value={version.id} key={version.id}>{version.productCode} · {version.display_name} v{version.version}</option>)}</select></label>
          <div className={styles.formGrid}><label>Nominal pengajuan<input name="requested_principal_amount" type="number" min={1000} step={1000} required /></label><label>Tenor (bulan)<input name="requested_tenor_months" type="number" min={1} max={360} required /></label></div>
          <label>Tujuan pinjaman<textarea name="purpose" minLength={5} maxLength={500} rows={3} required /></label>
          <div className={styles.formGrid}><label>Penghasilan per bulan<input name="declared_monthly_income_amount" type="number" min={1000} step={1000} required /></label><label>Kewajiban berjalan per bulan<input name="declared_monthly_obligation_amount" type="number" min={0} step={1000} defaultValue={0} required /></label></div>
          <label>Catatan agunan (bila diwajibkan)<textarea name="collateral_note" maxLength={500} rows={2} /></label>
          <label>Catatan penjamin (bila diwajibkan)<textarea name="guarantor_note" maxLength={500} rows={2} /></label>
          <PendingSubmitButton pendingLabel="Menyimpan…">Simpan Draft Pengajuan</PendingSubmitButton>
        </form> : <div className={styles.precondition}><strong>Prasyarat belum lengkap.</strong><p>Diperlukan anggota ACTIVE dan minimal satu produk pinjaman dengan versi APPROVED.</p><Link href="/loans/products">Buka Produk Pinjaman</Link></div>}</details> : null}
      </section>
      {failure ? <div className={styles.error}>{failure}</div> : null}
      <section className={styles.metrics} aria-label="Ringkasan pengajuan">
        <article><span>Total pengajuan</span><strong>{metrics.total}</strong><small>semua status</small></article>
        <article><span>Draft</span><strong>{metrics.draft}</strong><small>belum diajukan</small></article>
        <article><span>Menunggu</span><strong>{metrics.waiting}</strong><small>submit + pemeriksaan</small></article>
        <article><span>Disetujui</span><strong>{metrics.approved}</strong><small>belum menjadi kontrak</small></article>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>REGISTRY SUPABASE</span><h3>Daftar pengajuan organisasi</h3></div><b>{applications.length}</b></div>
        {applications.length ? <div className={styles.tableWrap}><table><thead><tr><th>Nomor</th><th>Anggota</th><th>Produk</th><th>Pengajuan</th><th>Kelayakan</th><th>Status</th><th></th></tr></thead><tbody>{applications.map((application) => {
          const member = memberMap.get(application.member_id);
          const product = productMap.get(application.product_id);
          return <tr key={application.id}><td><strong>{application.application_number}</strong><small>{new Date(application.created_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</small></td><td><strong>{member?.full_name || "Anggota"}</strong><small>{member?.member_number || "—"}</small></td><td>{product?.code || "—"}</td><td><strong>{money(application.requested_principal_amount)}</strong><small>{application.requested_tenor_months} bulan</small></td><td><span className={`${styles.badge} ${application.eligibility_status === "PASS" ? styles.pass : application.eligibility_status === "FAIL" ? styles.fail : ""}`}>{application.eligibility_status === "PASS" ? "LULUS" : application.eligibility_status === "FAIL" ? "TIDAK LULUS" : "BELUM DIPERIKSA"}</span></td><td><span className={`${styles.badge} ${styles[application.status.toLowerCase()] || ""}`}>{statusLabel(application.status)}</span></td><td><Link className={styles.openLink} href={`/loans/applications/${application.id}`}>Buka</Link></td></tr>;
        })}</tbody></table></div> : <div className={styles.empty}><strong>Belum ada pengajuan pinjaman.</strong><p>Buat draft setelah produk pinjaman disetujui.</p></div>}
      </section>
      <section className={styles.notice}><strong>Pagar pengaman 4E-2</strong><p>Saldo simpanan hanya dibaca untuk uji kelayakan. Sistem tidak mendebit rekening simpanan, tidak mengaktifkan pembayaran POS dari simpanan, dan tidak menulis transaksi ke D1.</p></section>
    </div>
  </section>;
}
