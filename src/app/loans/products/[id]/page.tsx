import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { LoanDraftEditor } from "../loan-draft-editor";
import { approveLoanVersionAction, createNextLoanVersionAction, rejectLoanVersionAction, submitLoanVersionAction } from "../actions";
import styles from "@/app/savings/products/products.module.css";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> };
type Version = Record<string, unknown> & { id: string; version: number; status: string; display_name: string; created_by: string; repayment_channels: string[]; disbursement_channels: string[] };
const value = (version: Version, key: string) => version[key] ?? "";
const money = (amount: unknown) => `Rp${Number(amount || 0).toLocaleString("id-ID")}`;
const percent = (amount: unknown) => `${(Number(amount || 0) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

function errorText(code?: string) {
  const messages: Record<string, string> = { invalid: "Data versi belum valid.", save: "Draft belum dapat disimpan.", submit: "Versi belum dapat diajukan.", maker: "Pembuat versi tidak boleh menjadi pemeriksa versi yang sama.", approve: "Versi belum dapat diaktifkan.", reason: "Alasan penolakan minimal 5 karakter.", reject: "Versi belum dapat ditolak.", "open-version": "Masih ada DRAFT atau versi yang sedang diperiksa.", version: "Versi baru belum dapat dibuat." };
  return code ? messages[code] || null : null;
}

export default async function LoanProductDetailPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_PRODUCT_VIEW")) redirect("/dashboard");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("loan_products").select("id,code,status,current_approved_version,loan_product_versions(*)").eq("id", id).eq("organization_id", access.organization.id).maybeSingle();
  if (error || !product) notFound();
  const versions = ([...(product.loan_product_versions ?? [])] as Version[]).sort((a, b) => b.version - a.version);
  const draft = versions.find((version) => version.status === "DRAFT");
  const submitted = versions.find((version) => version.status === "SUBMITTED");
  const approved = versions.find((version) => version.status === "APPROVED");
  const focus = draft || submitted || approved || versions[0];
  if (!focus) notFound();
  const canManage = access.permissions.includes("LOAN_PRODUCT_MANAGE");
  const canApprove = access.permissions.includes("LOAN_PRODUCT_APPROVE");
  const failure = errorText(query.error);

  return <section className="workspace"><header className="workspace-header"><div><p className="workspace-kicker">PRODUK PINJAMAN · {product.code}</p><h1>{focus.display_name}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/loans/products">← Daftar Produk</Link><h2>{focus.display_name}</h2><p>{String(value(focus, "description") || "Belum ada penjelasan produk.")}</p></div><div className={styles.detailStatus}><span>Status produk</span><strong>{product.status}</strong><small>Versi aktif: {product.current_approved_version ? `v${product.current_approved_version}` : "belum ada"}</small></div></section>
      {query.status ? <div className={styles.success}>Perubahan berhasil diproses.</div> : null}{failure ? <div className={styles.error}>{failure}</div> : null}
      <section className={styles.metrics}><article><span>Versi dibuka</span><strong>v{focus.version}</strong><small>{focus.status}</small></article><article><span>Plafon maksimum</span><strong>{money(value(focus, "max_principal_amount"))}</strong></article><article><span>Tenor maksimum</span><strong>{String(value(focus, "max_tenor_months"))} bulan</strong></article><article><span>Bunga per tahun</span><strong>{percent(value(focus, "interest_rate_bps"))}</strong><small>{String(value(focus, "interest_method"))}</small></article></section>

      {draft && canManage ? <section className={styles.panel}><div className={styles.panelHead}><div><span>EDIT DRAFT · v{draft.version}</span><h3>Aturan Produk</h3></div><b>MASIH DAPAT DIEDIT</b></div><LoanDraftEditor productId={product.id} version={draft} /><div className={styles.workflowBox}><div><strong>Sudah selesai mengatur?</strong><p>Setelah diajukan, isi versi dikunci.</p></div><form action={submitLoanVersionAction}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="version_id" value={draft.id} /><PendingSubmitButton pendingLabel="Mengajukan…">Ajukan untuk Diperiksa</PendingSubmitButton></form></div></section> : null}

      {submitted ? <section className={styles.panel}><div className={styles.panelHead}><div><span>MENUNGGU PEMERIKSA · v{submitted.version}</span><h3>{submitted.display_name}</h3></div><b>{submitted.created_by === access.user.id ? "DIBUAT OLEH ANDA" : "SIAP DIPERIKSA"}</b></div><div className={styles.reviewGrid}><div><span>Plafon</span><strong>{money(value(submitted, "max_principal_amount"))}</strong></div><div><span>Tenor</span><strong>{String(value(submitted, "min_tenor_months"))}–{String(value(submitted, "max_tenor_months"))} bulan</strong></div><div><span>Bunga</span><strong>{String(value(submitted, "interest_method"))} · {percent(value(submitted, "interest_rate_bps"))}</strong></div><div><span>Batas DSR</span><strong>{percent(value(submitted, "max_dsr_bps"))}</strong></div></div>
        {canApprove && submitted.created_by !== access.user.id ? <div className={styles.reviewActions}><form action={approveLoanVersionAction}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="version_id" value={submitted.id} /><PendingSubmitButton pendingLabel="Mengaktifkan…">Periksa &amp; Aktifkan</PendingSubmitButton></form><form action={rejectLoanVersionAction} className={styles.rejectForm}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="version_id" value={submitted.id} /><input name="rejection_reason" required minLength={5} maxLength={500} placeholder="Alasan penolakan" /><PendingSubmitButton pendingLabel="Menolak…">Tolak Versi</PendingSubmitButton></form></div> : <p className={styles.waitingNote}>Versi ini harus diperiksa oleh user lain yang memiliki hak persetujuan.</p>}
      </section> : null}

      {!draft && !submitted && canManage && approved ? <section className={styles.panel}><div className={styles.panelHead}><div><span>PERUBAHAN PRODUK</span><h3>Buat versi baru</h3></div></div><form action={createNextLoanVersionAction} className={styles.newVersion}><input type="hidden" name="product_id" value={product.id} /><input name="change_note" maxLength={500} placeholder="Apa yang akan diubah?" /><PendingSubmitButton pendingLabel="Membuat…">Buat Draft Versi Baru</PendingSubmitButton></form></section> : null}

      <section className={styles.panel}><div className={styles.panelHead}><div><span>RIWAYAT VERSI</span><h3>Jejak perubahan produk</h3></div><b>{versions.length}</b></div><div className={styles.tableWrap}><table><thead><tr><th>Versi</th><th>Nama</th><th>Status</th><th>Plafon</th><th>Tenor</th><th>Bunga</th></tr></thead><tbody>{versions.map((version) => <tr key={version.id}><td><strong>v{version.version}</strong></td><td>{version.display_name}</td><td><span className={`${styles.badge} ${version.status === "APPROVED" ? styles.active : version.status === "SUBMITTED" ? styles.wait : ""}`}>{version.status}</span></td><td>{money(value(version, "max_principal_amount"))}</td><td>{String(value(version, "max_tenor_months"))} bulan</td><td>{String(value(version, "interest_method"))} · {percent(value(version, "interest_rate_bps"))}</td></tr>)}</tbody></table></div></section>
      <section className={styles.notice}><strong>Transaksi belum aktif</strong><p>Produk yang disetujui belum dapat dicairkan atau dibayar. Ledger pinjaman, jadwal angsuran, jurnal, dan kanal transaksi dibangun pada milestone berikutnya setelah kontrol produk dinyatakan lulus.</p></section>
    </div>
  </section>;
}
