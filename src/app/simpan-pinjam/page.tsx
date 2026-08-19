import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import {
  DisbursementIcon,LoanApplicationIcon,RepaymentIcon,SavingsDepositIcon,SavingsWithdrawIcon,SettlementIcon,UsersIcon,
} from "@/components/ui/icons";
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
    {label:"Simpanan Masuk",description:"Catat setoran simpanan anggota",href:"/savings/accounts?intent=deposit",show:access.permissions.includes("SAVINGS_DEPOSIT"),tone:"positive",icon:SavingsDepositIcon},
    {label:"Penarikan Simpanan",description:"Catat pengambilan simpanan anggota",href:"/savings/accounts?intent=withdraw",show:access.permissions.includes("SAVINGS_WITHDRAW"),tone:"negative",icon:SavingsWithdrawIcon},
    {label:"Angsuran Masuk",description:"Terima pembayaran angsuran pinjaman",href:"/loans/repayments",show:access.permissions.includes("LOAN_REPAYMENT_VIEW"),tone:"positive",icon:RepaymentIcon},
    {label:"Pengajuan Pinjaman",description:"Buat pengajuan pinjaman baru",href:"/loans/applications",show:access.permissions.includes("LOAN_APPLICATION_VIEW"),tone:"info",icon:LoanApplicationIcon},
  ].filter(action=>action.show);

  const attention=[
    {label:"Pengajuan menunggu",value:pendingApplications,href:"/loans/applications",show:access.permissions.includes("LOAN_APPLICATION_VIEW")},
    {label:"Siap dicairkan",value:readyLoans,href:"/loans/disbursements",show:access.permissions.includes("LOAN_DISBURSEMENT_VIEW")},
  ].filter(item=>item.show);

  return <PageContainer size="wide">
    <PageHeader eyebrow="Simpan Pinjam" title="Ringkasan Simpan Pinjam" description="Kelola simpanan dan pinjaman anggota dari satu area kerja yang sederhana."/>
    {readError?<Alert tone="warning" title="Sebagian ringkasan belum terbaca">Transaksi tetap dapat dibuka melalui aksi utama sesuai hak akses Anda.</Alert>:null}

    <section className={styles.metrics} aria-label="Ringkasan simpan pinjam">
      <Card density="compact"><span>Rekening Aktif</span><strong>{activeSavings}</strong><small>rekening simpanan</small></Card>
      <Card density="compact"><span>Pinjaman Berjalan</span><strong>{activeLoans}</strong><small>kontrak telah dicairkan</small></Card>
      <Card density="compact"><span>Pengajuan Menunggu</span><strong>{pendingApplications}</strong><small>perlu ditindaklanjuti</small></Card>
      <Card density="compact"><span>Siap Dicairkan</span><strong>{readyLoans}</strong><small>kontrak siap proses</small></Card>
    </section>

    {actions.length?<section className={styles.section}>
      <div className={styles.sectionHead}><div><span>Transaksi</span><h2>Pilih pekerjaan yang akan dilakukan</h2></div></div>
      <div className={styles.quickGrid}>{actions.map(action=>{const Icon=action.icon;return <Link className={`${styles.quickAction} ${styles[action.tone]}`} href={action.href} key={action.label}><span className={styles.actionMark}><Icon size={22}/></span><span className={styles.actionCopy}><strong>{action.label}</strong><small>{action.description}</small></span></Link>})}</div>
    </section>:null}

    <section className={styles.mainGrid}>
      <Card className={styles.workspace}>
        <div className={styles.workspaceTitle}><span className={styles.workspaceIcon}><UsersIcon size={20}/></span><div><span>Simpanan</span><h2>Rekening dan transaksi simpanan</h2></div></div>
        <div className={styles.links}>
          {canSavings?<Link href="/savings/accounts">Rekening Anggota</Link>:null}
          {access.permissions.includes("SAVINGS_DEPOSIT")?<Link href="/savings/accounts?intent=deposit"><SavingsDepositIcon size={16}/>Simpanan Masuk</Link>:null}
          {access.permissions.includes("SAVINGS_WITHDRAW")?<Link href="/savings/accounts?intent=withdraw"><SavingsWithdrawIcon size={16}/>Penarikan</Link>:null}
          {access.permissions.includes("SAVINGS_TX_VIEW")||access.permissions.includes("SAVINGS_TRANSACTION_VIEW")?<Link href="/savings/reports">Laporan Simpanan</Link>:null}
        </div>
      </Card>

      <Card className={styles.workspace}>
        <div className={styles.workspaceTitle}><span className={styles.workspaceIcon}><LoanApplicationIcon size={20}/></span><div><span>Pinjaman</span><h2>Pengajuan sampai pelunasan</h2></div></div>
        <div className={styles.links}>
          {access.permissions.includes("LOAN_APPLICATION_VIEW")?<Link href="/loans/applications"><LoanApplicationIcon size={16}/>Pengajuan</Link>:null}
          {access.permissions.includes("LOAN_DISBURSEMENT_VIEW")?<Link href="/loans/disbursements"><DisbursementIcon size={16}/>Pencairan</Link>:null}
          {access.permissions.includes("LOAN_REPAYMENT_VIEW")?<Link href="/loans/repayments"><RepaymentIcon size={16}/>Angsuran</Link>:null}
          {access.permissions.includes("LOAN_CORRECTION_VIEW")||access.permissions.includes("LOAN_REPAYMENT_POST")?<Link href="/loans/corrections"><SettlementIcon size={16}/>Pelunasan & Koreksi</Link>:null}
        </div>
      </Card>

      {attention.length?<Card className={styles.attention}>
        <div className={styles.attentionHead}><div><span>Perlu perhatian</span><h2>Pekerjaan yang belum selesai</h2></div></div>
        <div className={styles.attentionList}>{attention.map(item=><Link href={item.href} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></Link>)}</div>
      </Card>:null}
    </section>
  </PageContainer>;
}
