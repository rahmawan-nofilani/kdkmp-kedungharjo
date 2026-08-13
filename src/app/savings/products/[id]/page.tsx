import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SavingsDraftEditor } from "../savings-draft-editor";
import { approveSavingsVersionAction, createNextSavingsVersionAction, rejectSavingsVersionAction, submitSavingsVersionAction } from "../actions";
import styles from "../products.module.css";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> };
type Version = Record<string, unknown> & { id:string; version:number; status:string; display_name:string; created_by:string; allow_pos_spend:boolean; payment_channels:string[] };
const money=(v:unknown)=>`Rp${Number(v||0).toLocaleString("id-ID")}`;
const val=(v:Version,k:string)=>v[k]??"";

function errorText(code?:string){
  const map:Record<string,string>={invalid:"Data versi belum valid.",save:"Draft belum dapat disimpan.",submit:"Versi belum dapat diajukan.",maker:"Pembuat versi tidak boleh menjadi pemeriksa versi yang sama.",approve:"Versi belum dapat diaktifkan.",reason:"Alasan penolakan minimal 5 karakter.",reject:"Versi belum dapat ditolak.","open-version":"Masih ada DRAFT atau versi yang sedang diperiksa.",version:"Versi baru belum dapat dibuat."};
  return code?map[code]||null:null;
}

export default async function SavingsProductDetailPage({params,searchParams}:PageProps){
  const access=await getAccessContext();
  if(!access) redirect("/login");
  if(!access.permissions.includes("SAVINGS_PRODUCT_VIEW")) redirect("/dashboard");
  const [{id},query]=await Promise.all([params,searchParams]);
  const supabase=await createClient();
  const {data:product,error}=await supabase.from("savings_products").select("id,code,status,current_approved_version,savings_product_versions(*)").eq("id",id).eq("organization_id",access.organization.id).maybeSingle();
  if(error||!product) notFound();
  const versions=([...(product.savings_product_versions??[])] as Version[]).sort((a,b)=>b.version-a.version);
  const draft=versions.find(v=>v.status==="DRAFT");
  const submitted=versions.find(v=>v.status==="SUBMITTED");
  const approved=versions.find(v=>v.status==="APPROVED");
  const focus=draft||submitted||approved||versions[0];
  if(!focus) notFound();
  const canManage=access.permissions.includes("SAVINGS_PRODUCT_MANAGE");
  const canApprove=access.permissions.includes("SAVINGS_PRODUCT_APPROVE");
  const failure=errorText(query.error);

  return <section className="workspace"><header className="workspace-header"><div><p className="workspace-kicker">PRODUK SIMPANAN · {product.code}</p><h1>{focus.display_name}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/savings/products">← Daftar Produk</Link><h2>{focus.display_name}</h2><p>{String(val(focus,"description")||"Belum ada penjelasan produk.")}</p></div><div className={styles.detailStatus}><span>Status produk</span><strong>{product.status}</strong><small>Versi aktif: {product.current_approved_version?`v${product.current_approved_version}`:"belum ada"}</small></div></section>
      {query.status?<div className={styles.success}>Perubahan berhasil diproses.</div>:null}{failure?<div className={styles.error}>{failure}</div>:null}
      <section className={styles.metrics}><article><span>Versi dibuka</span><strong>v{focus.version}</strong><small>{focus.status}</small></article><article><span>Setoran awal minimum</span><strong>{money(val(focus,"min_opening_amount"))}</strong></article><article><span>Saldo minimum</span><strong>{money(val(focus,"min_balance_amount"))}</strong></article><article><span>Belanja POS</span><strong>{focus.allow_pos_spend?"DIIZINKAN*":"TIDAK"}</strong><small>{focus.allow_pos_spend?"*runtime belum aktif":"pengaman default"}</small></article></section>

      {draft&&canManage?<section className={styles.panel}><div className={styles.panelHead}><div><span>EDIT DRAFT · v{draft.version}</span><h3>Aturan Produk</h3></div><b>MASIH DAPAT DIEDIT</b></div><SavingsDraftEditor productId={product.id} version={draft}/><div className={styles.workflowBox}><div><strong>Sudah selesai mengatur?</strong><p>Setelah diajukan, isi versi dikunci.</p></div><form action={submitSavingsVersionAction}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="version_id" value={draft.id}/><PendingSubmitButton pendingLabel="Mengajukan…">Ajukan untuk Diperiksa</PendingSubmitButton></form></div></section>:null}

      {submitted?<section className={styles.panel}><div className={styles.panelHead}><div><span>MENUNGGU PEMERIKSA · v{submitted.version}</span><h3>{submitted.display_name}</h3></div><b>{submitted.created_by===access.user.id?"DIBUAT OLEH ANDA":"SIAP DIPERIKSA"}</b></div><div className={styles.reviewGrid}><div><span>Setoran awal</span><strong>{money(val(submitted,"min_opening_amount"))}</strong></div><div><span>Saldo minimum</span><strong>{money(val(submitted,"min_balance_amount"))}</strong></div><div><span>Masa kunci</span><strong>{String(val(submitted,"lock_days"))} hari</strong></div><div><span>Belanja POS</span><strong>{submitted.allow_pos_spend?"DIIZINKAN*":"TIDAK"}</strong></div></div>
        {canApprove&&submitted.created_by!==access.user.id?<div className={styles.reviewActions}><form action={approveSavingsVersionAction}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="version_id" value={submitted.id}/><PendingSubmitButton pendingLabel="Mengaktifkan…">Periksa & Aktifkan</PendingSubmitButton></form><form action={rejectSavingsVersionAction} className={styles.rejectForm}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="version_id" value={submitted.id}/><input name="rejection_reason" required minLength={5} maxLength={500} placeholder="Alasan penolakan"/><PendingSubmitButton pendingLabel="Menolak…">Tolak Versi</PendingSubmitButton></form></div>:<p className={styles.waitingNote}>Versi ini harus diperiksa oleh user lain yang memiliki hak persetujuan.</p>}</section>:null}

      {!draft&&!submitted&&canManage&&approved?<section className={styles.panel}><div className={styles.panelHead}><div><span>PERUBAHAN PRODUK</span><h3>Buat versi baru</h3></div></div><form action={createNextSavingsVersionAction} className={styles.newVersion}><input type="hidden" name="product_id" value={product.id}/><input name="change_note" maxLength={500} placeholder="Apa yang akan diubah?"/><PendingSubmitButton pendingLabel="Membuat…">Buat Draft Versi Baru</PendingSubmitButton></form></section>:null}

      <section className={styles.panel}><div className={styles.panelHead}><div><span>RIWAYAT VERSI</span><h3>Jejak perubahan produk</h3></div><b>{versions.length}</b></div><div className={styles.tableWrap}><table><thead><tr><th>Versi</th><th>Nama</th><th>Status</th><th>Belanja POS</th><th>Setoran awal</th><th>Saldo minimum</th></tr></thead><tbody>{versions.map(v=><tr key={v.id}><td><strong>v{v.version}</strong></td><td>{v.display_name}</td><td><span className={`${styles.badge} ${v.status==="APPROVED"?styles.active:v.status==="SUBMITTED"?styles.wait:""}`}>{v.status}</span></td><td>{v.allow_pos_spend?"YA*":"TIDAK"}</td><td>{money(val(v,"min_opening_amount"))}</td><td>{money(val(v,"min_balance_amount"))}</td></tr>)}</tbody></table></div></section>
    </div></section>;
}
