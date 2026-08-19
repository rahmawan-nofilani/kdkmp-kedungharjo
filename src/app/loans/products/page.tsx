import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { createLoanProductAction } from "./actions";
import styles from "@/app/savings/products/products.module.css";

export const dynamic = "force-dynamic";
type PageProps = { searchParams: Promise<{ error?: string; status?: string }> };
type VersionRow = { id: string; version: number; status: string; display_name: string; max_principal_amount: number; max_tenor_months: number; interest_method: string; interest_rate_bps: number; created_by: string; created_at: string };
type ProductRow = { id: string; code: string; status: string; current_approved_version: number; created_at: string; updated_at: string; loan_product_versions: VersionRow[] };
function errorMessage(code?: string) {if (code === "invalid") return "Kode dan nama produk belum valid.";if (code === "duplicate") return "Kode produk sudah digunakan.";if (code === "save") return "Produk belum dapat disimpan. Periksa data lalu coba lagi.";return null;}
const money = (value: unknown) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const percent = (value: unknown) => `${(Number(value || 0) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

export default async function LoanProductsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();if (!access) redirect("/login");if (!access.permissions.includes("LOAN_PRODUCT_VIEW")) redirect("/dashboard");
  const params = await searchParams;const canManage = access.permissions.includes("LOAN_PRODUCT_MANAGE");const supabase = await createClient();
  const { data, error } = await supabase.from("loan_products").select("id,code,status,current_approved_version,created_at,updated_at,loan_product_versions(id,version,status,display_name,max_principal_amount,max_tenor_months,interest_method,interest_rate_bps,created_by,created_at)").eq("organization_id", access.organization.id).order("code", { ascending: true });
  const products = (data ?? []) as ProductRow[];
  const summary = products.reduce((acc, product) => {acc.total += 1;if (product.status === "ACTIVE") acc.active += 1;if (product.loan_product_versions.some((version) => version.status === "SUBMITTED")) acc.waiting += 1;if (product.loan_product_versions.some((version) => version.status === "DRAFT")) acc.draft += 1;return acc;}, { total: 0, active: 0, waiting: 0, draft: 0 });
  const failure = errorMessage(params.error) || (error ? "Daftar produk pinjaman belum dapat dibaca." : null);

  return <PageContainer size="full">
    <PageHeader eyebrow="Simpan Pinjam · Konfigurasi" title="Produk Pinjaman" description="Kelola plafon, tenor, bunga, biaya, dan aturan risiko melalui versi yang harus melewati maker-checker sebelum aktif." actions={canManage?<details className={styles.create}><summary>+ Buat Produk</summary><form action={createLoanProductAction}><label>Kode produk<input name="code" required minLength={2} maxLength={40} placeholder="contoh: PIN-MIKRO" /></label><label>Nama produk<input name="display_name" required minLength={3} maxLength={120} placeholder="contoh: Pinjaman Usaha Mikro" /></label><label>Penjelasan singkat<textarea name="description" rows={3} maxLength={500} placeholder="Tujuan dan karakter produk" /></label><PendingSubmitButton pendingLabel="Menyimpan…">Buat Draft Produk</PendingSubmitButton></form></details>:undefined}/>
    {failure?<Alert tone="danger">{failure}</Alert>:null}
    <section className={styles.metrics}><Card density="compact"><span>Total produk</span><strong>{summary.total}</strong><small>semua status</small></Card><Card density="compact"><span>Aktif</span><strong>{summary.active}</strong><small>versi approved</small></Card><Card density="compact"><span>Menunggu pemeriksa</span><strong>{summary.waiting}</strong><small>maker-checker</small></Card><Card density="compact"><span>Draft</span><strong>{summary.draft}</strong><small>masih dapat diedit</small></Card></section>
    <Card className={styles.panel}><div className={styles.panelHead}><div><span>DAFTAR PRODUK</span><h3>Konfigurasi produk pinjaman</h3></div><Badge>{products.length}</Badge></div>
      {products.length?<div className={styles.tableWrap}><table><thead><tr><th>Kode</th><th>Nama</th><th>Status</th><th>Versi aktif</th><th>Plafon</th><th>Tenor & bunga</th><th>Versi terbuka</th><th></th></tr></thead><tbody>{products.map((product)=>{const versions=[...product.loan_product_versions].sort((a,b)=>b.version-a.version);const active=versions.find((version)=>version.status==="APPROVED");const open=versions.find((version)=>version.status==="SUBMITTED"||version.status==="DRAFT");const shown=active||open||versions[0];return <tr key={product.id}><td><strong>{product.code}</strong></td><td><strong>{shown?.display_name||"Belum diberi nama"}</strong><small>{versions.length} versi</small></td><td><Badge tone={product.status==="ACTIVE"?"success":"neutral"}>{product.status}</Badge></td><td>{product.current_approved_version?`v${product.current_approved_version}`:"Belum ada"}</td><td>{shown?money(shown.max_principal_amount):"—"}</td><td>{shown?`${shown.max_tenor_months} bulan · ${shown.interest_method} ${percent(shown.interest_rate_bps)}`:"—"}</td><td>{open?<Badge tone={open.status==="SUBMITTED"?"warning":"info"}>v{open.version} · {open.status}</Badge>:"—"}</td><td><Link className={styles.openLink} href={`/loans/products/${product.id}`}>Buka Produk</Link></td></tr>;})}</tbody></table></div>:<div className={styles.empty}>Belum ada produk pinjaman.</div>}
    </Card>
    <Alert tone="info" title="Lifecycle terpisah">Halaman ini hanya mengatur aturan produk. Pengajuan, kontrak, pencairan, angsuran, penalti, koreksi, dan laporan ditangani oleh workflow Loan masing-masing; status human UAT Loan tetap terpisah dari migrasi desain.</Alert>
  </PageContainer>;
}
