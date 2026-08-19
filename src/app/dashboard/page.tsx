import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { LoanApplicationIcon,PosIcon,PurchaseIcon,RepaymentIcon,SavingsDepositIcon,SavingsWithdrawIcon } from "@/components/ui/icons";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const capabilityMap = [
  { permission: "POS_ACCESS", title: "Kasir & Penjualan", description: "POS, shift, struk, dan transaksi penjualan.", href:"/pos" },
  { permission: "SAVINGS_ACCOUNT_VIEW", title: "Simpan Pinjam", description: "Rekening, simpanan, pinjaman, angsuran, dan laporan.", href:"/simpan-pinjam" },
  { permission: "INVENTORY_VIEW", title: "Stok & Gudang", description: "Stok, pergerakan barang, gudang, dan penyesuaian.", href:"/inventory" },
  { permission: "PURCHASE_VIEW", title: "Pembelian", description: "Supplier, permintaan, PO, penerimaan, dan hutang pemasok.", href:"/procurement" },
  { permission: "FINANCE_VIEW", title: "Keuangan", description: "Kas & bank, jurnal, aset, rekonsiliasi, dan tutup buku.", href:"/finance" },
  { permission: "APPROVAL_VIEW", title: "Persetujuan", description: "Pekerjaan yang menunggu pemeriksaan atau persetujuan.", href:"/approvals" },
] as const;

const quickActions=[
  {permission:"POS_ACCESS",label:"Penjualan",description:"Buka kasir dan catat penjualan",href:"/pos",tone:"blue",icon:PosIcon},
  {permission:"SAVINGS_DEPOSIT",label:"Simpanan Masuk",description:"Catat setoran simpanan anggota",href:"/savings/accounts?intent=deposit",tone:"green",icon:SavingsDepositIcon},
  {permission:"SAVINGS_WITHDRAW",label:"Penarikan Simpanan",description:"Catat pengambilan simpanan anggota",href:"/savings/accounts?intent=withdraw",tone:"red",icon:SavingsWithdrawIcon},
  {permission:"LOAN_REPAYMENT_VIEW",label:"Angsuran Masuk",description:"Terima pembayaran angsuran pinjaman",href:"/loans/repayments",tone:"green",icon:RepaymentIcon},
  {permission:"LOAN_APPLICATION_VIEW",label:"Pengajuan Pinjaman",description:"Buat pengajuan pinjaman baru",href:"/loans/applications",tone:"blue",icon:LoanApplicationIcon},
  {permission:"PURCHASE_VIEW",label:"Pembelian",description:"Buka alur pembelian barang",href:"/procurement",tone:"amber",icon:PurchaseIcon},
] as const;

export default async function DashboardPage() {
  const access=await getAccessContext();
  if(!access) redirect("/login");
  const firstName=access.profile.fullName.trim().split(/\s+/)[0]||"Pengguna";
  const permissions=new Set(access.permissions);
  const capabilities=capabilityMap.filter((item)=>permissions.has(item.permission));
  const actions=quickActions.filter(item=>permissions.has(item.permission));
  const visiblePermissions=access.permissions.slice(0,10);

  const accountContext=<>
    <section className={styles.summaryGrid} aria-label="Konteks akun">
      <Card density="compact"><span className={styles.metricLabel}>Role</span><strong className={styles.metricValue}>{access.role.name}</strong><small className={styles.metricMeta}>{access.permissions.length} hak akses aktif</small></Card>
      <Card density="compact"><span className={styles.metricLabel}>Unit kerja</span><strong className={styles.metricValue}>{access.units.length||1}</strong><small className={styles.metricMeta}>{access.units.map((unit)=>unit.name).join(", ")||"Scope organisasi"}</small></Card>
      <Card density="compact"><span className={styles.metricLabel}>Organisasi</span><strong className={styles.metricValue}>{access.organization.code}</strong><small className={styles.metricMeta}>{access.organization.name}</small></Card>
      <Card density="compact"><span className={styles.metricLabel}>Status akun</span><strong className={styles.metricValue}>{access.profile.status}</strong><small className={styles.metricMeta}>{access.user.email}</small></Card>
    </section>
    <Card className={styles.accessCard}>
      <CardHeader title="Konteks akses" description="Informasi teknis untuk pemeriksaan role dan permission akun." />
      <div className={styles.permissionCloud} aria-label="Permission aktif">
        {visiblePermissions.map((permission)=><span className={styles.permissionItem} key={permission}>{permission}</span>)}
        {access.permissions.length>visiblePermissions.length?<span className={styles.permissionMore}>+{access.permissions.length-visiblePermissions.length} lainnya</span>:null}
      </div>
    </Card>
  </>;

  return <main className={styles.page}>
    <PageContainer size="wide">
      <PageHeader eyebrow={access.organization.name} title={`Selamat datang, ${firstName}`} description="Pilih pekerjaan yang ingin dilakukan. Menu dan aksi ditampilkan sesuai hak akses akun Anda."/>

      {actions.length?<section className={styles.quickSection}>
        <div className={styles.sectionHead}><span>Transaksi</span><h2>Pekerjaan harian</h2></div>
        <div className={styles.quickGrid}>{actions.map(action=>{const Icon=action.icon;return <Link className={`${styles.quickAction} ${styles[action.tone]}`} href={action.href} key={action.label}><span className={styles.quickIcon}><Icon size={21}/></span><span className={styles.quickCopy}><strong>{action.label}</strong><small>{action.description}</small></span></Link>})}</div>
      </section>:null}

      <section className={styles.moduleSection}>
        <div className={styles.sectionHead}><span>Area kerja</span><h2>Modul yang tersedia</h2></div>
        <div className={styles.moduleGrid}>{capabilities.map(item=><Link href={item.href} className={styles.moduleCard} key={item.title}><strong>{item.title}</strong><span>{item.description}</span><b>Buka</b></Link>)}</div>
      </section>

      <div className={styles.desktopContext}>{accountContext}</div>
      <details className={styles.mobileContext}>
        <summary>Detail akun & akses <span>{access.role.name}</span></summary>
        <div className={styles.mobileContextBody}>{accountContext}</div>
      </details>
    </PageContainer>
  </main>;
}
