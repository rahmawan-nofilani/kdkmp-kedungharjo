import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { SavingsAccountOpenPanel } from "./account-open-panel";
import { SavingsAccountsTable, type SavingsAccountRow } from "./accounts-table";
import styles from "./accounts.module.css";

export const dynamic = "force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string}>};
type MemberRow={id:string;member_number:string;full_name:string};
type VersionRow={id:string;version:number;status:string;display_name:string};
type ProductRow={id:string;code:string;current_approved_version:number;savings_product_versions:VersionRow[]};

function errorText(code?:string){const map:Record<string,string>={invalid:"Anggota dan produk wajib dipilih.",duplicate:"Anggota sudah memiliki rekening untuk produk tersebut.",member:"Anggota tidak ACTIVE.",product:"Produk belum ACTIVE atau belum memiliki versi yang disetujui.",effective:"Versi produk belum efektif atau sudah berakhir.",maker:"Pembuka rekening tidak boleh menjadi pemeriksa rekening yang sama.",reason:"Alasan penolakan minimal 5 karakter.",forbidden:"Akun tidak memiliki kewenangan untuk tindakan ini.",save:"Rekening belum dapat diproses."};return code?map[code]||map.save:null;}

export default async function SavingsAccountsPage({searchParams}:PageProps){
  const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("SAVINGS_ACCOUNT_VIEW"))redirect("/dashboard");
  const params=await searchParams;const canOpen=access.permissions.includes("SAVINGS_ACCOUNT_OPEN");const canApprove=access.permissions.includes("SAVINGS_ACCOUNT_APPROVE");
  const supabase=await createClient();
  const [accountsResult,membersResult,activeMembersResult,productsResult]=await Promise.all([
    supabase.from("savings_accounts").select("id,account_number,member_id,status,rule_snapshot,opened_by,opened_at,rejection_reason").eq("organization_id",access.organization.id).order("opened_at",{ascending:false}),
    supabase.from("members").select("id,member_number,full_name").eq("organization_id",access.organization.id).order("member_number"),
    supabase.from("members").select("id,member_number,full_name").eq("organization_id",access.organization.id).eq("status","ACTIVE").order("member_number"),
    supabase.from("savings_products").select("id,code,current_approved_version,savings_product_versions(id,version,status,display_name)").eq("organization_id",access.organization.id).eq("status","ACTIVE").order("code")
  ]);
  const accounts=(accountsResult.data??[]) as SavingsAccountRow[];const members=(membersResult.data??[]) as MemberRow[];const activeMembers=(activeMembersResult.data??[]) as MemberRow[];const products=(productsResult.data??[]) as ProductRow[];
  const productChoices=products.map(product=>{const version=product.savings_product_versions.find(v=>v.status==="APPROVED"&&v.version===product.current_approved_version);return version?{productId:product.id,code:product.code,displayName:version.display_name,version:version.version}:null;}).filter(Boolean) as Array<{productId:string;code:string;displayName:string;version:number}>;
  const counts=accounts.reduce((a,row)=>{a.total++;if(row.status==="ACTIVE")a.active++;if(row.status==="PENDING")a.pending++;if(row.status==="REJECTED")a.rejected++;return a;},{total:0,active:0,pending:0,rejected:0});
  const failure=errorText(params.error)||accountsResult.error?.message||null;
  return <section className="workspace"><header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · REKENING</p><h1>Rekening Simpanan</h1></div></header><div className={`workspace-content ${styles.content}`}>
    <section className={styles.hero}><div><span>REGISTRY REKENING · BELUM ADA SALDO</span><h2>Buka rekening berdasarkan produk yang sudah disetujui.</h2><p>Rekening membekukan versi aturan produk saat dibuka. Fase ini belum menerima setoran, penarikan, atau pembayaran POS.</p></div>{canOpen?<SavingsAccountOpenPanel members={activeMembers} products={productChoices}/>:null}</section>
    {params.status?<div className={styles.success}>{params.status==="opened"?"Permohonan rekening berhasil dibuat dan menunggu pemeriksa.":params.status==="approved"?"Rekening berhasil diaktifkan.":"Permohonan rekening berhasil ditolak."}</div>:null}{failure?<div className={styles.error}>{failure}</div>:null}
    <section className={styles.metrics}><article><span>Total rekening</span><strong>{counts.total}</strong><small>registry, bukan saldo</small></article><article><span>ACTIVE</span><strong>{counts.active}</strong><small>siap untuk fase transaksi berikutnya</small></article><article className={counts.pending?styles.attention:undefined}><span>Menunggu pemeriksa</span><strong>{counts.pending}</strong><small>maker-checker</small></article><article><span>Ditolak</span><strong>{counts.rejected}</strong><small>tidak dapat menerima transaksi</small></article></section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>DAFTAR REKENING</span><h3>Registry rekening anggota</h3></div><b>{accounts.length}</b></div>{accounts.length?<SavingsAccountsTable accounts={accounts} members={members} userId={access.user.id} canApprove={canApprove}/>:<div className={styles.empty}>Belum ada rekening simpanan.</div>}</section>
    <section className={styles.notice}><strong>Pengaman Phase 4B</strong><p>Rekening ACTIVE belum memiliki saldo tersimpan. Pada Phase 4C, saldo akan dihitung dari ledger transaksi D1, bukan field saldo yang bisa diedit. Opsi belanja POS tetap tidak terhubung.</p></section>
  </div></section>;
}
