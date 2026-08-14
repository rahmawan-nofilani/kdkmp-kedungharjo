import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { SavingsAccountOpenPanel } from "./account-open-panel";
import { SavingsAccountsTable, type SavingsAccountRow } from "./accounts-table";
import styles from "./accounts.module.css";

export const dynamic = "force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string}>};
type MemberRow={id:string;member_number:string;full_name:string;status:string};
type VersionRow={id:string;version:number;status:string;display_name:string};
type ProductRow={id:string;code:string;current_approved_version:number;savings_product_versions:VersionRow[]};

function errorText(code?:string){const map:Record<string,string>={invalid:"Anggota dan produk wajib dipilih.",duplicate:"Anggota sudah memiliki rekening untuk produk tersebut.",member:"Anggota tidak ACTIVE.",product:"Produk belum ACTIVE atau belum memiliki versi yang disetujui.",effective:"Versi produk belum efektif atau sudah berakhir.",maker:"Pembuka rekening tidak boleh menjadi pemeriksa rekening yang sama.",reason:"Alasan penolakan minimal 5 karakter.",forbidden:"Akun tidak memiliki kewenangan untuk tindakan ini.",save:"Rekening belum dapat diproses."};return code?map[code]||map.save:null;}

export default async function SavingsAccountsPage({searchParams}:PageProps){
  const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("SAVINGS_ACCOUNT_VIEW"))redirect("/dashboard");
  const params=await searchParams;
  const canOpen=access.permissions.includes("SAVINGS_ACCOUNT_OPEN");
  const canApprove=access.permissions.includes("SAVINGS_ACCOUNT_APPROVE");
  const canViewMembers=access.permissions.includes("MEMBER_VIEW");
  const supabase=await createClient();

  const emptyMembers=Promise.resolve({data:[] as MemberRow[],error:null});
  const emptyProducts=Promise.resolve({data:[] as ProductRow[],error:null});
  const [accountsResult,membersResult,productsResult]=await Promise.all([
    supabase.from("savings_accounts").select("id,account_number,member_id,status,rule_snapshot,opened_by,opened_at,rejection_reason").eq("organization_id",access.organization.id).order("opened_at",{ascending:false}),
    canViewMembers?supabase.from("members").select("id,member_number,full_name,status").eq("organization_id",access.organization.id).order("member_number"):emptyMembers,
    canOpen?supabase.from("savings_products").select("id,code,current_approved_version,savings_product_versions(id,version,status,display_name)").eq("organization_id",access.organization.id).eq("status","ACTIVE").order("code"):emptyProducts,
  ]);

  const accounts=(accountsResult.data??[]) as SavingsAccountRow[];
  const members=(membersResult.data??[]) as MemberRow[];
  const activeMembers=members.filter((row)=>row.status==="ACTIVE").map(({id,member_number,full_name})=>({id,member_number,full_name}));
  const products=(productsResult.data??[]) as ProductRow[];
  const productChoices=products.map(product=>{const version=product.savings_product_versions.find(v=>v.status==="APPROVED"&&v.version===product.current_approved_version);return version?{productId:product.id,code:product.code,displayName:version.display_name,version:version.version}:null;}).filter(Boolean) as Array<{productId:string;code:string;displayName:string;version:number}>;
  const counts=accounts.reduce((a,row)=>{a.total++;if(row.status==="ACTIVE")a.active++;if(row.status==="PENDING")a.pending++;if(row.status==="REJECTED")a.rejected++;return a;},{total:0,active:0,pending:0,rejected:0});
  const failure=errorText(params.error)||accountsResult.error?.message||membersResult.error?.message||productsResult.error?.message||null;

  return <section className="workspace"><header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · REKENING</p><h1>Rekening Simpanan</h1></div></header><div className={`workspace-content ${styles.content}`}>
    <section className={styles.hero}><div><span>REGISTRY REKENING · LEDGER v11</span><h2>Kelola rekening berdasarkan produk yang sudah disetujui.</h2><p>Rekening ACTIVE memiliki Saldo & Mutasi yang dihitung dari transaksi D1. Saldo tidak dapat diedit manual dan pembayaran POS dari Simpanan tetap nonaktif.</p><p><Link href="/savings/reports">Buka Laporan & Integritas Simpanan →</Link></p></div>{canOpen&&canViewMembers?<SavingsAccountOpenPanel members={activeMembers} products={productChoices}/>:null}</section>
    {canApprove?<div className={styles.success}><strong>Mode Pemeriksa Aktif.</strong> Rekening PENDING yang dibuat pengguna lain dapat diperiksa dan diaktifkan atau ditolak dari tabel di bawah.</div>:null}
    {canOpen&&!canViewMembers?<div className={styles.notice}><strong>Pembukaan rekening dibatasi.</strong><p>Akun ini memiliki hak membuka rekening tetapi tidak memiliki hak melihat Master Anggota.</p></div>:null}
    {params.status?<div className={styles.success}>{params.status==="opened"?"Permohonan rekening berhasil dibuat dan menunggu pemeriksa.":params.status==="approved"?"Rekening berhasil diaktifkan. Ledger D1 akan disiapkan otomatis atau saat Saldo & Mutasi pertama kali dibuka.":"Permohonan rekening berhasil ditolak."}</div>:null}{failure?<div className={styles.error}>{failure}</div>:null}
    <section className={styles.metrics}><article><span>Total rekening</span><strong>{counts.total}</strong><small>registry organisasi</small></article><article><span>ACTIVE</span><strong>{counts.active}</strong><small>siap menerima transaksi sesuai aturan produk</small></article><article className={counts.pending?styles.attention:undefined}><span>Menunggu pemeriksa</span><strong>{counts.pending}</strong><small>pembuat–pemeriksa</small></article><article><span>Ditolak</span><strong>{counts.rejected}</strong><small>tidak dapat menerima transaksi</small></article></section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>DAFTAR REKENING</span><h3>Registry rekening anggota</h3></div><b>{accounts.length}</b></div>{accounts.length?<SavingsAccountsTable accounts={accounts} members={members.map(({id,member_number,full_name})=>({id,member_number,full_name}))} userId={access.user.id} canApprove={canApprove}/>:<div className={styles.empty}>Belum ada rekening simpanan.</div>}</section>
    <section className={styles.notice}><strong>Pengaman Phase 4D</strong><p>Saldo berasal dari ledger transaksi D1, koreksi memakai Pembalikan, dan laporan integritas memeriksa hubungan mutasi dengan jurnal. Opsi belanja POS tetap tidak terhubung.</p></section>
  </div></section>;
}
