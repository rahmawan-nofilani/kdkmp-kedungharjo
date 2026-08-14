import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getApprovalQueue } from "@/lib/d1/approval-center";
import { createClient } from "@/lib/supabase/server";
import styles from "./approvals.module.css";

export const dynamic = "force-dynamic";

type QueueItem={key:string;category:string;reference:string;title:string;detail:string;amount:number|null;createdBy:string;createdAt:string;href:string};
function rupiah(value:number|null){if(value===null)return "—";return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value);}
function waktu(value:string){return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"});}
function categoryLabel(category:string){return ({PEMBELIAN:"Pembelian",HUTANG_SUPPLIER:"Hutang Pemasok",JURNAL:"Jurnal",ASET:"Aset Tetap",PENYUSUTAN:"Penyusutan",STOCK_OPNAME:"Hitung Stok",PRODUK_SIMPANAN:"Produk Simpanan",REKENING_SIMPANAN:"Rekening Simpanan",PRODUK_PINJAMAN:"Produk Pinjaman"} as Record<string,string>)[category]||category;}
function canReviewCategory(category:string,p:Set<string>){if(p.has("APPROVAL_VIEW"))return true;if(category==="PEMBELIAN")return p.has("PURCHASE_APPROVE");if(category==="HUTANG_SUPPLIER")return p.has("INVOICE_APPROVE");if(category==="JURNAL")return p.has("JOURNAL_APPROVE");if(category==="ASET"||category==="PENYUSUTAN")return p.has("ASSET_APPROVE");if(category==="STOCK_OPNAME")return p.has("ORG_MANAGE");if(category==="PRODUK_SIMPANAN")return p.has("SAVINGS_PRODUCT_APPROVE");if(category==="REKENING_SIMPANAN")return p.has("SAVINGS_ACCOUNT_APPROVE");if(category==="PRODUK_PINJAMAN")return p.has("LOAN_PRODUCT_APPROVE");return false;}

export default async function ApprovalCenterPage(){
  const access=await getAccessContext();if(!access)redirect("/login");
  const allowed=new Set(access.permissions);
  const canOpen=["APPROVAL_VIEW","PURCHASE_APPROVE","INVOICE_APPROVE","JOURNAL_APPROVE","ASSET_APPROVE","SAVINGS_PRODUCT_APPROVE","SAVINGS_ACCOUNT_APPROVE","LOAN_PRODUCT_APPROVE","ORG_MANAGE"].some(code=>allowed.has(code));
  if(!canOpen)redirect("/dashboard");
  const schema=await getD1SchemaStatus();if(!schema.features.assetDepreciation)redirect("/setup/database");
  const supabase=await createClient();
  const savingsProductTask=(allowed.has("SAVINGS_PRODUCT_APPROVE")||allowed.has("APPROVAL_VIEW"))
    ?supabase.from("savings_product_versions").select("id,product_id,version,display_name,created_by,created_at,submitted_at,savings_products!inner(id,code,organization_id)").eq("status","SUBMITTED").eq("savings_products.organization_id",access.organization.id).limit(80)
    :Promise.resolve({data:[],error:null});
  const savingsAccountTask=(allowed.has("SAVINGS_ACCOUNT_APPROVE")||allowed.has("APPROVAL_VIEW"))
    ?supabase.from("savings_accounts").select("id,account_number,rule_snapshot,opened_by,opened_at").eq("organization_id",access.organization.id).eq("status","PENDING").order("opened_at",{ascending:true}).limit(80)
    :Promise.resolve({data:[],error:null});
  const loanProductTask=(allowed.has("LOAN_PRODUCT_APPROVE")||allowed.has("APPROVAL_VIEW"))
    ?supabase.from("loan_product_versions").select("id,product_id,version,display_name,created_by,created_at,submitted_at,loan_products!inner(id,code,organization_id)").eq("status","SUBMITTED").eq("loan_products.organization_id",access.organization.id).limit(80)
    :Promise.resolve({data:[],error:null});

  const [d1Queue,savingsProductResult,savingsAccountResult,loanProductResult]=await Promise.all([getApprovalQueue(access.organization.id),savingsProductTask,savingsAccountTask,loanProductTask]);
  const savingsProductQueue:QueueItem[]=(savingsProductResult.data??[]).map((row:any)=>{const product=Array.isArray(row.savings_products)?row.savings_products[0]:row.savings_products;return {key:`savings-product:${row.id}`,category:"PRODUK_SIMPANAN",reference:`${product?.code||"PRODUK"} · v${row.version}`,title:row.display_name,detail:"Versi aturan produk simpanan sudah diajukan dan menunggu pemeriksa yang berbeda.",amount:null,createdBy:row.created_by,createdAt:row.submitted_at||row.created_at,href:`/savings/products/${row.product_id}`};});
  const savingsAccountQueue:QueueItem[]=(savingsAccountResult.data??[]).map((row:any)=>{const snapshot=(row.rule_snapshot&&typeof row.rule_snapshot==="object")?row.rule_snapshot:{};const productName=String(snapshot.display_name||snapshot.product_code||"Produk Simpanan");return {key:`savings-account:${row.id}`,category:"REKENING_SIMPANAN",reference:row.account_number,title:productName,detail:"Permohonan pembukaan rekening simpanan menunggu pemeriksa yang berbeda sebelum dapat menerima transaksi.",amount:null,createdBy:row.opened_by,createdAt:row.opened_at,href:"/savings/accounts"};});
  const loanProductQueue:QueueItem[]=(loanProductResult.data??[]).map((row:any)=>{const product=Array.isArray(row.loan_products)?row.loan_products[0]:row.loan_products;return {key:`loan-product:${row.id}`,category:"PRODUK_PINJAMAN",reference:`${product?.code||"PRODUK"} · v${row.version}`,title:row.display_name,detail:"Versi aturan produk pinjaman sudah diajukan dan menunggu pemeriksa yang berbeda.",amount:null,createdBy:row.created_by,createdAt:row.submitted_at||row.created_at,href:`/loans/products/${row.product_id}`};});
  const allQueue:QueueItem[]=[...(d1Queue as QueueItem[]),...savingsProductQueue,...savingsAccountQueue,...loanProductQueue].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const queue=allQueue.filter(item=>canReviewCategory(item.category,allowed));
  const mine=queue.filter(item=>item.createdBy===access.user.id).length,reviewable=queue.filter(item=>item.createdBy!==access.user.id).length;
  const categories=new Map<string,number>();for(const item of queue)categories.set(item.category,(categories.get(item.category)||0)+1);

  return <main className={styles.page}><header className={styles.topbar}><div><p>KONTROL · PEMERIKSAAN</p><h1>Pusat Persetujuan</h1></div><nav><Link href="/dashboard">Dashboard</Link></nav></header><div className={styles.content}>
    <section className={styles.hero}><div><span>PEKERJAAN YANG MENUNGGU PEMERIKSAAN</span><h2>Lihat apa yang perlu diperiksa, lalu buka detail sebelum memberi keputusan.</h2><p>Halaman ini menjadi pusat antrian. Keputusan tetap dilakukan di halaman asal agar data lengkap terlihat terlebih dahulu. Pembuat tidak boleh menyetujui pekerjaannya sendiri.</p></div><div className={styles.role}><span>Role aktif</span><strong>{access.role.name}</strong><small>{access.organization.name}</small></div></section>
    <section className={styles.metrics}><article><span>Total menunggu</span><strong>{queue.length}</strong><small>sesuai hak akses Anda</small></article><article className={reviewable?styles.attention:undefined}><span>Siap Anda periksa</span><strong>{reviewable}</strong><small>dibuat pengguna lain</small></article><article><span>Dibuat oleh Anda</span><strong>{mine}</strong><small>harus diperiksa orang lain</small></article><article><span>Jenis pekerjaan</span><strong>{categories.size}</strong><small>kategori yang tampil</small></article></section>
    {categories.size?<section className={styles.categoryStrip}>{Array.from(categories.entries()).map(([category,count])=><div key={category}><span>{categoryLabel(category)}</span><strong>{count}</strong></div>)}</section>:null}
    <section className={styles.panel}><div className={styles.panelHeader}><div><span>ANTRIAN PEMERIKSAAN</span><h3>Yang perlu ditindaklanjuti</h3></div><b>{queue.length}</b></div>{queue.length?<div className={styles.queue}>{queue.map(item=>{const own=item.createdBy===access.user.id;return <article key={item.key} className={own?styles.own:styles.reviewable}><div className={styles.queueTop}><span>{categoryLabel(item.category)}</span><b>{own?"MENUNGGU ORANG LAIN":"SIAP DIPERIKSA"}</b></div><h4>{item.reference}</h4><strong>{item.title}</strong><p>{item.detail}</p><div className={styles.queueMeta}><span>{rupiah(item.amount)}</span><span>{waktu(item.createdAt)}</span></div><Link href={item.href}>{own?"Lihat status →":"Buka detail & periksa →"}</Link></article>;})}</div>:<div className={styles.empty}><strong>Tidak ada pekerjaan yang menunggu.</strong><p>Semua proses yang menjadi kewenangan Anda sudah selesai atau belum ada yang dikirim untuk diperiksa.</p></div>}</section>
    <section className={styles.notice}><strong>Kenapa tidak ada tombol “Setujui Semua”?</strong><p>Karena setiap keputusan membutuhkan konteks. Produk simpanan, rekening simpanan, dan produk pinjaman tetap harus dibuka serta diperiksa sebelum diaktifkan.</p></section>
  </div></main>;
}
