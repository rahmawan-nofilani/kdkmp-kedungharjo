import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import styles from "./hub.module.css";

export const dynamic="force-dynamic";

const domainPermissions=["SAVINGS_PRODUCT_VIEW","SAVINGS_ACCOUNT_VIEW","SAVINGS_TX_VIEW","SAVINGS_TRANSACTION_VIEW","LOAN_PRODUCT_VIEW","LOAN_APPLICATION_VIEW","LOAN_CONTRACT_VIEW","LOAN_DISBURSEMENT_VIEW","LOAN_REPAYMENT_VIEW","LOAN_PENALTY_VIEW","LOAN_REPORT_VIEW"];

type StatusRow={status:string};

export default async function SimpanPinjamHub(){
  const access=await getAccessContext();
  if(!access)redirect("/login");
  if(!domainPermissions.some(code=>access.permissions.includes(code)))redirect("/dashboard");
  const supabase=await createClient();
  const canSavings=access.permissions.includes("SAVINGS_ACCOUNT_VIEW");
  const canLoans=access.permissions.includes("LOAN_APPLICATION_VIEW")||access.permissions.includes("LOAN_CONTRACT_VIEW");
  const [savingsResult,applicationResult,contractResult]=await Promise.all([
    canSavings?supabase.from("savings_accounts").select("status").eq("organization_id",access.organization.id):Promise.resolve({data:[] as StatusRow[],error:null}),
    canLoans?supabase.from("loan_applications").select("status").eq("organization_id",access.organization.id):Promise.resolve({data:[] as StatusRow[],error:null}),
    canLoans?supabase.from("loan_contracts").select("status").eq("organization_id",access.organization.id):Promise.resolve({data:[] as StatusRow[],error:null}),
  ]);
  const savings=(savingsResult.data??[]) as StatusRow[];
  const applications=(applicationResult.data??[]) as StatusRow[];
  const contracts=(contractResult.data??[]) as StatusRow[];
  const activeSavings=savings.filter(row=>row.status==="ACTIVE").length;
  const pendingApplications=applications.filter(row=>["SUBMITTED","UNDER_REVIEW"].includes(row.status)).length;
  const activeLoans=contracts.filter(row=>row.status==="DISBURSED").length;
  const readyLoans=contracts.filter(row=>row.status==="READY").length;
  const readError=savingsResult.error||applicationResult.error||contractResult.error;

  const actions=[
    {label:"Setoran Masuk",description:"Catat simpanan masuk anggota",href:"/savings/accounts?intent=deposit",show:access.permissions.includes("SAVINGS_DEPOSIT"),tone:"green"},
    {label:"Penarikan",description:"Catat simpanan keluar anggota",href:"/savings/accounts?intent=withdraw",show:access.permissions.includes("SAVINGS_WITHDRAW"),tone:"red"},
    {label:"Bayar Angsuran",description:"Catat pembayaran pinjaman",href:"/loans/repayments",show:access.permissions.includes("LOAN_REPAYMENT_VIEW"),tone:"blue"},
    {label:"Ajukan Pinjaman",description:"Buat pengajuan pinjaman baru",href:"/loans/applications",show:access.permissions.includes("LOAN_APPLICATION_VIEW"),tone:"purple"},
  ].filter(action=>action.show);

  return <PageContainer size="wide">
    <PageHeader eyebrow="Simpan Pinjam" title="Beranda Simpan Pinjam" description="Pusat kerja harian untuk simpanan dan pinjaman. Aksi utama diprioritaskan; konfigurasi dan laporan tetap tersedia melalui menu."/>
    {readError?<Alert tone="warning" title="Sebagian ringkasan belum terbaca">Menu transaksi tetap dapat digunakan sesuai hak akses.</Alert>:null}

    <section className={styles.metrics}>
      <Card density="compact"><span>Rekening aktif</span><strong>{activeSavings}</strong><small>rekening simpanan anggota</small></Card>
      <Card density="compact"><span>Pengajuan menunggu</span><strong>{pendingApplications}</strong><small>submitted / under review</small></Card>
      <Card density="compact"><span>Pinjaman berjalan</span><strong>{activeLoans}</strong><small>kontrak telah dicairkan</small></Card>
      <Card density="compact"><span>Siap dicairkan</span><strong>{readyLoans}</strong><small>kontrak READY</small></Card>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><div><span>AKSI CEPAT</span><h2>Transaksi yang paling sering dipakai</h2></div></div>
      <div className={styles.quickGrid}>{actions.map(action=><Link className={`${styles.quickAction} ${styles[action.tone]}`} href={action.href} key={action.label}><span className={styles.actionMark}>→</span><strong>{action.label}</strong><small>{action.description}</small></Link>)}</div>
    </section>

    <section className={styles.workspaceGrid}>
      {canSavings?<Card className={styles.workspace}><span>SIMPANAN</span><h2>Kelola simpanan anggota</h2><p>Rekening, transaksi masuk/keluar, riwayat dan integritas ledger tetap menggunakan flow yang sudah lulus UAT.</p><div className={styles.links}><Link href="/savings/accounts">Rekening Anggota</Link><Link href="/savings/reports">Riwayat & Laporan</Link>{access.permissions.includes("SAVINGS_PRODUCT_VIEW")?<Link href="/savings/products">Produk Simpanan</Link>:null}</div></Card>:null}
      {canLoans?<Card className={styles.workspace}><span>PINJAMAN</span><h2>Kelola siklus pinjaman</h2><p>Pengajuan, kontrak, pencairan, angsuran, denda dan koreksi tetap memakai maker-checker dan transaction engine yang sama.</p><div className={styles.links}><Link href="/loans/applications">Pengajuan</Link>{access.permissions.includes("LOAN_DISBURSEMENT_VIEW")?<Link href="/loans/disbursements">Pencairan</Link>:null}{access.permissions.includes("LOAN_REPAYMENT_VIEW")?<Link href="/loans/repayments">Angsuran</Link>:null}{access.permissions.includes("LOAN_REPORT_VIEW")?<Link href="/loans/reports">Laporan</Link>:null}</div></Card>:null}
    </section>

    <Alert tone="info" title="Logika transaksi tidak berubah">Halaman ini hanya menyederhanakan navigasi. Ledger D1, jurnal, treasury, maker-checker, idempotency, RBAC, dan seluruh server action lama tetap menjadi source of truth.</Alert>
  </PageContainer>;
}
