import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { createSavingsProductAction } from "./actions";
import styles from "./products.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{error?:string;status?:string}>};
type VersionRow={id:string;version:number;status:string;display_name:string;allow_pos_spend:boolean;created_by:string;created_at:string};
type ProductRow={id:string;code:string;status:string;current_approved_version:number;created_at:string;updated_at:string;savings_product_versions:VersionRow[]};
function errorMessage(code?:string){if(code==="invalid")return"Kode dan nama produk belum valid.";if(code==="duplicate")return"Kode produk sudah digunakan.";if(code==="save")return"Produk belum dapat disimpan. Periksa data lalu coba lagi.";return null}
function statusTone(status:string):"success"|"warning"|"danger"|"info"|"neutral"{if(status==="ACTIVE"||status==="APPROVED")return"success";if(status==="SUBMITTED")return"warning";if(status==="DRAFT")return"info";if(status==="REJECTED")return"danger";return"neutral"}

export default async function SavingsProductsPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("SAVINGS_PRODUCT_VIEW"))redirect("/dashboard");const params=await searchParams;const canManage=access.permissions.includes("SAVINGS_PRODUCT_MANAGE");const supabase=await createClient();
 const{data,error}=await supabase.from("savings_products").select("id,code,status,current_approved_version,created_at,updated_at,savings_product_versions(id,version,status,display_name,allow_pos_spend,created_by,created_at)").eq("organization_id",access.organization.id).order("code",{ascending:true});const products=(data??[])as ProductRow[];
 const summary=products.reduce((acc,product)=>{acc.total+=1;if(product.status==="ACTIVE")acc.active+=1;if(product.savings_product_versions.some((v)=>v.status==="SUBMITTED"))acc.waiting+=1;if(product.savings_product_versions.some((v)=>v.status==="DRAFT"))acc.draft+=1;return acc},{total:0,active:0,waiting:0,draft:0});const failure=errorMessage(params.error)||(error?"Daftar produk simpanan belum dapat dibaca.":null);
 return <PageContainer size="full">
  <PageHeader eyebrow="Simpan Pinjam · Konfigurasi" title="Produk Simpanan" description="Aturan simpanan dikelola sebagai konfigurasi berversi dengan maker-checker sebelum menjadi versi aktif." actions={<div className={styles.panelHead}><Link href="/savings/accounts">Rekening</Link><Link href="/savings/reports">Laporan & Integritas</Link></div>}/>
  {failure?<Alert tone="danger">{failure}</Alert>:null}
  <Card className={styles.hero}><div><span>MESIN PRODUK KEUANGAN</span><h2>Konfigurasi produk tanpa menulis ulang transaksi lama.</h2><p>Setiap perubahan memiliki versi dan harus diperiksa sebelum aktif. Flag penggunaan saldo untuk belanja POS tidak berarti runtime POS otomatis menggunakannya.</p></div>{canManage?<details className={styles.create}><summary>+ Buat Produk</summary><form action={createSavingsProductAction}><label>Kode produk<input name="code" required minLength={2} maxLength={40} placeholder="contoh: SIM-SUKARELA"/></label><label>Nama produk<input name="display_name" required minLength={3} maxLength={120} placeholder="contoh: Simpanan Sukarela"/></label><label>Penjelasan singkat<textarea name="description" rows={3} maxLength={500} placeholder="Tujuan dan karakter produk"/></label><PendingSubmitButton pendingLabel="Menyimpan…">Buat Draft Produk</PendingSubmitButton></form></details>:null}</Card>
  <section className={styles.metrics}><Card density="compact"><span>Total produk</span><strong>{summary.total}</strong><small>semua status</small></Card><Card density="compact"><span>Aktif</span><strong>{summary.active}</strong><small>sudah punya versi disetujui</small></Card><Card density="compact"><span>Menunggu pemeriksa</span><strong>{summary.waiting}</strong><small>versi sudah diajukan</small></Card><Card density="compact"><span>Draft</span><strong>{summary.draft}</strong><small>masih dapat diedit</small></Card></section>
  <Card className={styles.panel}><div className={styles.panelHead}><div><span>DAFTAR PRODUK</span><h3>Konfigurasi produk simpanan</h3></div><Badge>{products.length}</Badge></div>{products.length?<div className={styles.tableWrap}><table><thead><tr><th>Kode</th><th>Nama</th><th>Status</th><th>Versi aktif</th><th>Belanja POS</th><th>Versi terbuka</th><th></th></tr></thead><tbody>{products.map((product)=>{const versions=[...product.savings_product_versions].sort((a,b)=>b.version-a.version);const active=versions.find((v)=>v.status==="APPROVED");const open=versions.find((v)=>v.status==="SUBMITTED"||v.status==="DRAFT");const shown=active||open||versions[0];return <tr key={product.id}><td><strong>{product.code}</strong></td><td><strong>{shown?.display_name||"Belum diberi nama"}</strong><small>{versions.length} versi</small></td><td><Badge tone={statusTone(product.status)}>{product.status}</Badge></td><td>{product.current_approved_version?`v${product.current_approved_version}`:"Belum ada"}</td><td><Badge tone={active?.allow_pos_spend?"warning":"neutral"}>{active?.allow_pos_spend?"DIIZINKAN*":"TIDAK"}</Badge>{active?.allow_pos_spend?<small>*runtime POS tetap terpisah</small>:null}</td><td>{open?<Badge tone={statusTone(open.status)}>v{open.version} · {open.status}</Badge>:"—"}</td><td><Link className={styles.openLink} href={`/savings/products/${product.id}`}>Buka Produk</Link></td></tr>})}</tbody></table></div>:<div className={styles.empty}>Belum ada produk simpanan. Buat produk pertama sebagai DRAFT.</div>}</Card>
  <Alert tone="info" title="Boundary produk">Rekening, setoran, penarikan, pembalikan, ledger, dan jurnal sudah memiliki alur tersendiri. Halaman ini hanya mengelola aturan produk dan versinya.</Alert>
 </PageContainer>;
}
