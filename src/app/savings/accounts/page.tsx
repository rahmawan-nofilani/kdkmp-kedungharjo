import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { SavingsDepositIcon,SavingsWithdrawIcon } from "@/components/ui/icons";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { SavingsAccountOpenPanel } from "./account-open-panel";
import { SavingsAccountsTable, type SavingsAccountRow } from "./accounts-table";
import styles from "./accounts.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string;intent?:string}>};
type MemberRow={id:string;member_number:string;full_name:string;status:string};
type VersionRow={id:string;version:number;status:string;display_name:string};
type ProductRow={id:string;code:string;current_approved_version:number;savings_product_versions:VersionRow[]};
function errorText(code?:string){const map:Record<string,string>={invalid:"Anggota dan produk wajib dipilih.",duplicate:"Anggota sudah memiliki rekening untuk produk tersebut.",member:"Anggota tidak aktif.",product:"Produk belum aktif atau belum memiliki versi yang disetujui.",effective:"Versi produk belum efektif atau sudah berakhir.",maker:"Pembuka rekening tidak boleh menjadi pemeriksa rekening yang sama.",reason:"Alasan penolakan minimal 5 karakter.",forbidden:"Akun tidak memiliki kewenangan untuk tindakan ini.",save:"Rekening belum dapat diproses."};return code?map[code]||map.save:null}

export default async function SavingsAccountsPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("SAVINGS_ACCOUNT_VIEW"))redirect("/dashboard");const params=await searchParams;const canOpen=access.permissions.includes("SAVINGS_ACCOUNT_OPEN");const canApprove=access.permissions.includes("SAVINGS_ACCOUNT_APPROVE");const canViewMembers=access.permissions.includes("MEMBER_VIEW");const supabase=await createClient();
 const intent=params.intent==="deposit"?"deposit":params.intent==="withdraw"?"withdraw":undefined;
 const emptyMembers=Promise.resolve({data:[] as MemberRow[],error:null});const emptyProducts=Promise.resolve({data:[] as ProductRow[],error:null});const[accountsResult,membersResult,productsResult]=await Promise.all([supabase.from("savings_accounts").select("id,account_number,member_id,status,rule_snapshot,opened_by,opened_at,rejection_reason").eq("organization_id",access.organization.id).order("opened_at",{ascending:false}),canViewMembers?supabase.from("members").select("id,member_number,full_name,status").eq("organization_id",access.organization.id).order("member_number"):emptyMembers,canOpen?supabase.from("savings_products").select("id,code,current_approved_version,savings_product_versions(id,version,status,display_name)").eq("organization_id",access.organization.id).eq("status","ACTIVE").order("code"):emptyProducts]);
 const accounts=(accountsResult.data??[])as SavingsAccountRow[];const members=(membersResult.data??[])as MemberRow[];const activeMembers=members.filter((row)=>row.status==="ACTIVE").map(({id,member_number,full_name})=>({id,member_number,full_name}));const products=(productsResult.data??[])as ProductRow[];const productChoices=products.map(product=>{const version=product.savings_product_versions.find(v=>v.status==="APPROVED"&&v.version===product.current_approved_version);return version?{productId:product.id,code:product.code,displayName:version.display_name,version:version.version}:null}).filter(Boolean)as Array<{productId:string;code:string;displayName:string;version:number}>;const counts=accounts.reduce((a,row)=>{a.total++;if(row.status==="ACTIVE")a.active++;if(row.status==="PENDING")a.pending++;if(row.status==="REJECTED")a.rejected++;return a},{total:0,active:0,pending:0,rejected:0});const failure=errorText(params.error)||accountsResult.error?.message||membersResult.error?.message||productsResult.error?.message||null;
 const pageTitle=intent==="deposit"?"Simpanan Masuk":intent==="withdraw"?"Penarikan Simpanan":"Rekening Simpanan";
 const pageDescription=intent==="deposit"?"Pilih rekening anggota yang akan menerima setoran.":intent==="withdraw"?"Pilih rekening anggota yang akan melakukan penarikan.":"Lihat dan kelola rekening simpanan anggota.";
 const ModeIcon=intent==="deposit"?SavingsDepositIcon:SavingsWithdrawIcon;
 return <PageContainer size="full">
  <PageHeader eyebrow="Simpan Pinjam · Simpanan" title={pageTitle} description={pageDescription} actions={<div className={styles.panelHead}><Link href="/simpan-pinjam">Ringkasan</Link><Link href="/savings/reports">Laporan</Link>{access.permissions.includes("SAVINGS_PRODUCT_VIEW")?<Link href="/savings/products">Pengaturan Produk</Link>:null}</div>}/>
  {intent?<Card className={`${styles.modeBanner} ${intent==="deposit"?styles.depositMode:styles.withdrawMode}`}><span className={styles.modeIcon}><ModeIcon size={24}/></span><div><strong>{intent==="deposit"?"Simpanan Masuk":"Penarikan Simpanan"}</strong><p>{intent==="deposit"?"Pilih rekening aktif anggota. Setelah itu masukkan nominal dan metode penerimaan.":"Pilih rekening aktif anggota. Setelah itu masukkan nominal penarikan dan metode pembayaran."}</p></div></Card>:null}
  {canApprove&&!intent?<Alert tone="info" title="Persetujuan rekening">Rekening yang menunggu persetujuan dan dibuat pengguna lain dapat diperiksa dari daftar.</Alert>:null}
  {canOpen&&!canViewMembers?<Alert tone="warning" title="Pembukaan rekening dibatasi">Akun ini dapat membuka rekening, tetapi tidak memiliki akses untuk melihat daftar anggota.</Alert>:null}
  {params.status?<Alert tone="success">{params.status==="opened"?"Permohonan rekening berhasil dibuat dan menunggu pemeriksa.":params.status==="approved"?"Rekening berhasil diaktifkan.":"Permohonan rekening berhasil ditolak."}</Alert>:null}
  {failure?<Alert tone="danger">{failure}</Alert>:null}
  {!intent?<section className={styles.hero}><Card className={styles.panel}><div className={styles.panelHead}><div><span>Rekening Simpanan</span><h3>Rekening anggota</h3></div><Badge tone="info">{counts.active} aktif</Badge></div><p>Buka rekening anggota baru atau pilih rekening aktif untuk melihat saldo dan mutasi.</p></Card>{canOpen&&canViewMembers?<SavingsAccountOpenPanel members={activeMembers} products={productChoices}/>:null}</section>:null}
  <section className={styles.metrics}><Card density="compact"><span>Total Rekening</span><strong>{counts.total}</strong><small>semua rekening</small></Card><Card density="compact"><span>Aktif</span><strong>{counts.active}</strong><small>siap digunakan</small></Card><Card density="compact" className={counts.pending?styles.attention:undefined}><span>Menunggu Persetujuan</span><strong>{counts.pending}</strong><small>perlu diperiksa</small></Card><Card density="compact"><span>Ditolak</span><strong>{counts.rejected}</strong><small>tidak aktif</small></Card></section>
  <Card className={styles.panel}><div className={styles.panelHead}><div><span>{intent?"Pilih Rekening":"Daftar Rekening"}</span><h3>{intent?`Rekening untuk ${intent==="deposit"?"simpanan masuk":"penarikan"}`:"Rekening simpanan anggota"}</h3></div><Badge>{accounts.length}</Badge></div>{accounts.length?<SavingsAccountsTable accounts={accounts} members={members.map(({id,member_number,full_name})=>({id,member_number,full_name}))} userId={access.user.id} canApprove={canApprove} intent={intent}/>:<div className={styles.empty}>Belum ada rekening simpanan.</div>}</Card>
 </PageContainer>;
}
