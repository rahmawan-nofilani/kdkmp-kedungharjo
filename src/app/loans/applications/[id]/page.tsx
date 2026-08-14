import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import {
  cancelLoanApplicationAction,
  decideLoanApplicationAction,
  evaluateLoanApplicationAction,
  startLoanApplicationReviewAction,
  submitLoanApplicationAction,
} from "../actions";
import styles from "../applications.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; status?: string }> };
type JsonObject = Record<string, unknown>;
type EventRow = { id: string; event_type: string; from_status: string | null; to_status: string; note: string | null; created_at: string };
type CheckRow = { code: string; label: string; passed: boolean; detail: string };

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function checks(value: unknown): CheckRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = object(item);
    return typeof row.code === "string" && typeof row.label === "string" && typeof row.passed === "boolean" && typeof row.detail === "string"
      ? [{ code: row.code, label: row.label, passed: row.passed, detail: row.detail }]
      : [];
  });
}

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function time(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: string) {
  return ({ DRAFT: "DRAFT", SUBMITTED: "MENUNGGU PEMERIKSA", UNDER_REVIEW: "SEDANG DIPERIKSA", APPROVED: "DISETUJUI", REJECTED: "DITOLAK", CANCELLED: "DIBATALKAN" } as Record<string, string>)[status] || status;
}

function eventLabel(event: string) {
  return ({ CREATED: "DIBUAT", DRAFT_UPDATED: "DRAFT DIPERBARUI", SUBMITTED: "DIAJUKAN", REVIEW_STARTED: "PEMERIKSAAN DIMULAI", APPROVED: "DISETUJUI", REJECTED: "DITOLAK", CANCELLED: "DIBATALKAN" } as Record<string, string>)[event] || event;
}

function errorMessage(code?: string) {
  if (code === "not-draft") return "Pengajuan tidak lagi berstatus DRAFT.";
  if (code === "source") return "Data anggota, produk, rekening simpanan, atau komitmen belum dapat dibaca.";
  if (code === "not-eligible") return "Pengajuan belum lulus seluruh pemeriksaan kelayakan.";
  if (code === "active-limit") return "Batas komitmen aktif anggota sudah tercapai.";
  if (code === "maker") return "Pembuat/pengaju tidak boleh menjadi pemeriksa.";
  if (code === "reason") return "Alasan penolakan wajib minimal 5 karakter.";
  if (code === "save") return "Perubahan belum dapat disimpan.";
  return null;
}

function successMessage(status?: string) {
  if (status === "created") return "Draft pengajuan berhasil dibuat.";
  if (status === "checked") return "Pemeriksaan kelayakan selesai dan snapshot baru tersimpan.";
  if (status === "submitted") return "Pengajuan dikirim ke pemeriksa.";
  if (status === "reviewing") return "Pemeriksaan maker–checker dimulai.";
  if (status === "approved") return "Pengajuan disetujui. Belum ada kontrak atau pencairan.";
  if (status === "rejected") return "Pengajuan ditolak dan keputusan tercatat.";
  if (status === "cancelled") return "Draft pengajuan dibatalkan.";
  return null;
}

export default async function LoanApplicationDetailPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_APPLICATION_VIEW")) redirect("/dashboard");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: application, error } = await supabase.from("loan_applications").select("*").eq("id", id).eq("organization_id", access.organization.id).maybeSingle();
  if (error || !application) redirect("/loans/applications?error=save");

  const [memberResult, productResult, versionResult, eventResult] = await Promise.all([
    supabase.from("members").select("id,member_number,full_name,status,member_since").eq("id", application.member_id).eq("organization_id", access.organization.id).maybeSingle(),
    supabase.from("loan_products").select("id,code,status,current_approved_version").eq("id", application.product_id).eq("organization_id", access.organization.id).maybeSingle(),
    supabase.from("loan_product_versions").select("id,version,status,display_name,interest_method,interest_rate_bps,installment_frequency,min_principal_amount,max_principal_amount,min_tenor_months,max_tenor_months,min_membership_months,min_savings_balance_amount,max_active_loans,max_dsr_bps,collateral_required,guarantor_required").eq("id", application.product_version_id).maybeSingle(),
    supabase.from("loan_application_events").select("id,event_type,from_status,to_status,note,created_at").eq("application_id", id).eq("organization_id", access.organization.id).order("created_at", { ascending: true }),
  ]);
  const productSnapshot = object(application.product_snapshot);
  const eligibilitySnapshot = object(application.eligibility_snapshot);
  const eligibilityChecks = checks(eligibilitySnapshot.checks);
  const events = (eventResult.data ?? []) as EventRow[];
  const member = memberResult.data;
  const product = productResult.data;
  const version = versionResult.data;
  const canManage = access.permissions.includes("LOAN_APPLICATION_MANAGE");
  const canApprove = access.permissions.includes("LOAN_APPLICATION_APPROVE");
  const maker = application.created_by === access.user.id || application.submitted_by === access.user.id;
  const canReview = canApprove && !maker;
  const failure = errorMessage(query.error) || memberResult.error || productResult.error || versionResult.error || eventResult.error
    ? errorMessage(query.error) || "Sebagian detail pengajuan belum dapat dibaca."
    : null;
  const success = successMessage(query.status);

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · DETAIL PENGAJUAN</p><h1>{application.application_number}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/loans/applications">← Daftar Pengajuan</Link><span>STATUS PROSES</span><h2>{statusLabel(application.status)}</h2><p>{member?.member_number || "—"} · {member?.full_name || "Anggota"} · {product?.code || String(productSnapshot.product_code || "Produk")}</p></div><div className={`${styles.eligibilityCard} ${application.eligibility_status === "PASS" ? styles.eligibilityPass : application.eligibility_status === "FAIL" ? styles.eligibilityFail : ""}`}><span>KELAYAKAN</span><strong>{application.eligibility_status === "PASS" ? "LULUS" : application.eligibility_status === "FAIL" ? "TIDAK LULUS" : "BELUM DIPERIKSA"}</strong><small>{time(application.eligibility_checked_at)}</small></div></section>
      {success ? <div className={styles.success}>{success}</div> : null}
      {failure ? <div className={styles.error}>{failure}</div> : null}

      <section className={styles.detailGrid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>DATA PERMOHONAN</span><h3>Nilai yang diajukan</h3></div></div><dl className={styles.definition}>
          <div><dt>Pokok</dt><dd>{money(application.requested_principal_amount)}</dd></div><div><dt>Tenor</dt><dd>{application.requested_tenor_months} bulan</dd></div>
          <div><dt>Penghasilan / bulan</dt><dd>{money(application.declared_monthly_income_amount)}</dd></div><div><dt>Kewajiban berjalan</dt><dd>{money(application.declared_monthly_obligation_amount)}</dd></div>
          <div className={styles.wide}><dt>Tujuan</dt><dd>{application.purpose}</dd></div><div className={styles.wide}><dt>Agunan</dt><dd>{application.collateral_note || "Tidak dicantumkan"}</dd></div><div className={styles.wide}><dt>Penjamin</dt><dd>{application.guarantor_note || "Tidak dicantumkan"}</dd></div>
        </dl></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>PROYEKSI</span><h3>Estimasi dari aturan produk</h3></div></div><dl className={styles.definition}>
          <div><dt>Produk</dt><dd>{version?.display_name || String(productSnapshot.display_name || "—")}</dd></div><div><dt>Versi</dt><dd>v{version?.version || Number(productSnapshot.version || 0)}</dd></div>
          <div><dt>Angsuran / periode</dt><dd>{money(application.projected_installment_amount)}</dd></div><div><dt>Komitmen / bulan</dt><dd>{money(application.projected_monthly_commitment_amount)}</dd></div>
          <div><dt>DSR setelah pinjaman</dt><dd>{application.calculated_dsr_bps == null ? "—" : `${(Number(application.calculated_dsr_bps) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}</dd></div><div><dt>Metode</dt><dd>{version ? `${version.interest_method} · ${version.installment_frequency}` : "—"}</dd></div>
        </dl></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>GERBANG KELAYAKAN</span><h3>Hasil pemeriksaan hanya-baca</h3></div><b>{eligibilityChecks.filter((check) => check.passed).length}/{eligibilityChecks.length}</b></div>
        {eligibilityChecks.length ? <div className={styles.checkGrid}>{eligibilityChecks.map((check) => <article key={check.code} className={check.passed ? styles.checkPass : styles.checkFail}><span>{check.passed ? "LULUS" : "GAGAL"}</span><strong>{check.label}</strong><p>{check.detail}</p></article>)}</div> : <div className={styles.empty}><strong>Belum ada snapshot kelayakan.</strong><p>Jalankan pemeriksaan saat pengajuan masih DRAFT.</p></div>}
      </section>

      {application.status === "DRAFT" && canManage ? <section className={styles.actionPanel}><div><span>AKSI MAKER</span><h3>Periksa, lalu kirim kepada checker</h3><p>Periksa ulang jika data sumber berubah. Hanya hasil PASS yang dapat diajukan.</p></div><div className={styles.actions}>
        <form action={evaluateLoanApplicationAction}><input type="hidden" name="application_id" value={id} /><PendingSubmitButton pendingLabel="Memeriksa…">Periksa Kelayakan</PendingSubmitButton></form>
        {application.eligibility_status === "PASS" ? <form action={submitLoanApplicationAction}><input type="hidden" name="application_id" value={id} /><PendingSubmitButton pendingLabel="Mengirim…">Kirim ke Pemeriksa</PendingSubmitButton></form> : null}
        <form action={cancelLoanApplicationAction}><input type="hidden" name="application_id" value={id} /><PendingSubmitButton pendingLabel="Membatalkan…">Batalkan Draft</PendingSubmitButton></form>
      </div></section> : null}

      {application.status === "SUBMITTED" ? <section className={styles.actionPanel}><div><span>MAKER–CHECKER</span><h3>Pengajuan menunggu pemeriksa berbeda</h3><p>{maker ? "Anda tercatat sebagai pembuat/pengaju sehingga tidak dapat memeriksa pengajuan ini." : "Buka pemeriksaan untuk mengunci jejak reviewer sebelum keputusan."}</p></div>{canReview ? <form action={startLoanApplicationReviewAction}><input type="hidden" name="application_id" value={id} /><PendingSubmitButton pendingLabel="Membuka…">Mulai Pemeriksaan</PendingSubmitButton></form> : null}</section> : null}

      {application.status === "UNDER_REVIEW" ? <section className={styles.decisionPanel}><div><span>KEPUTUSAN CHECKER</span><h3>Setujui atau tolak pengajuan</h3><p>Persetujuan hanya mengesahkan kelayakan. Kontrak, jadwal, pencairan, jurnal, dan angsuran belum dibuat.</p></div>{canReview ? <div className={styles.decisionForms}><form action={decideLoanApplicationAction}><input type="hidden" name="application_id" value={id} /><input type="hidden" name="decision" value="APPROVE" /><label>Catatan persetujuan (opsional)<textarea name="decision_note" maxLength={500} rows={2} /></label><PendingSubmitButton pendingLabel="Menyetujui…">Setujui Pengajuan</PendingSubmitButton></form><form action={decideLoanApplicationAction}><input type="hidden" name="application_id" value={id} /><input type="hidden" name="decision" value="REJECT" /><label>Alasan penolakan<textarea name="decision_note" required minLength={5} maxLength={500} rows={2} /></label><PendingSubmitButton pendingLabel="Menolak…">Tolak Pengajuan</PendingSubmitButton></form></div> : <div className={styles.precondition}>Pembuat/pengaju tidak dapat memberi keputusan.</div>}</section> : null}

      {application.status === "APPROVED" ? <section className={styles.successGate}><strong>Pengajuan disetujui—belum dicairkan.</strong><p>Data ini menjadi prasyarat milestone kontrak dan jadwal berikutnya. Tidak ada saldo, jurnal, D1, atau POS yang berubah.</p></section> : null}
      {application.status === "REJECTED" ? <section className={styles.rejectedGate}><strong>Pengajuan ditolak.</strong><p>{application.decision_note || "Alasan tercatat pada audit event."}</p></section> : null}

      <section className={styles.panel}><div className={styles.panelHead}><div><span>JEJAK AUDIT</span><h3>Riwayat status yang tidak dapat diubah</h3></div><b>{events.length}</b></div>{events.length ? <ol className={styles.timeline}>{events.map((event) => <li key={event.id}><span>{eventLabel(event.event_type)}</span><strong>{event.from_status ? `${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}` : statusLabel(event.to_status)}</strong><p>{event.note || "Perubahan dicatat otomatis oleh sistem."}</p><small>{time(event.created_at)}</small></li>)}</ol> : <div className={styles.empty}>Jejak audit belum dapat dibaca.</div>}</section>
      <section className={styles.notice}><strong>Batas arsitektur</strong><p>Supabase menyimpan registry pengajuan, eligibility snapshot, status, dan audit maker–checker. D1 savings_ledger_v11 hanya dibaca untuk saldo; pembayaran POS dari simpanan tetap nonaktif.</p></section>
    </div>
  </section>;
}
