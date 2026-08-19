import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const capabilityMap = [
  { permission: "POS_ACCESS", title: "Kasir & Penjualan", description: "POS, shift, receipt, dan transaksi tunai.", href:"/pos" },
  { permission: "SAVINGS_ACCOUNT_VIEW", title: "Simpan Pinjam", description: "Rekening, simpanan, pinjaman, angsuran, dan laporan.", href:"/simpan-pinjam" },
  { permission: "INVENTORY_VIEW", title: "Stok & Gudang", description: "Stok, movement, gudang, dan stock opname.", href:"/inventory" },
  { permission: "PURCHASE_VIEW", title: "Pembelian", description: "Supplier, purchase request, PO, receiving, dan AP.", href:"/procurement" },
  { permission: "FINANCE_VIEW", title: "Keuangan", description: "Kas & bank, jurnal, aset, rekonsiliasi, dan closing.", href:"/finance" },
  { permission: "APPROVAL_VIEW", title: "Persetujuan", description: "Antrean maker-checker lintas modul.", href:"/approvals" },
] as const;

const quickActions=[
  {permission:"POS_ACCESS",label:"POS / Penjualan",description:"Buka transaksi kasir",href:"/pos",tone:"blue"},
  {permission:"SAVINGS_DEPOSIT",label:"Setoran Simpanan",description:"Catat simpanan masuk",href:"/savings/accounts?intent=deposit",tone:"green"},
  {permission:"SAVINGS_WITHDRAW",label:"Penarikan Simpanan",description:"Catat simpanan keluar",href:"/savings/accounts?intent=withdraw",tone:"red"},
  {permission:"LOAN_REPAYMENT_VIEW",label:"Bayar Angsuran",description:"Catat pembayaran pinjaman",href:"/loans/repayments",tone:"purple"},
  {permission:"LOAN_APPLICATION_VIEW",label:"Ajukan Pinjaman",description:"Buat pengajuan baru",href:"/loans/applications",tone:"blue"},
  {permission:"PURCHASE_VIEW",label:"Pembelian",description:"Buka alur procurement",href:"/procurement",tone:"amber"},
] as const;

export default async function DashboardPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "Pengguna";
  const permissions = new Set(access.permissions);
  const capabilities = capabilityMap.filter((item) => permissions.has(item.permission));
  const actions=quickActions.filter(item=>permissions.has(item.permission));
  const visiblePermissions = access.permissions.slice(0, 10);

  return (
    <main className={styles.page}>
      <PageContainer size="wide">
        <PageHeader
          eyebrow={access.organization.name}
          title={`Selamat datang, ${firstName}`}
          description="Pilih pekerjaan yang ingin dilakukan. Menu dan aksi ditampilkan sesuai hak akses akun Anda."
        />

        {actions.length?<section className={styles.quickSection}>
          <div className={styles.sectionHead}><span>AKSI CEPAT</span><h2>Pekerjaan harian</h2></div>
          <div className={styles.quickGrid}>{actions.map(action=><Link className={`${styles.quickAction} ${styles[action.tone]}`} href={action.href} key={action.label}><span className={styles.quickIcon}>→</span><strong>{action.label}</strong><small>{action.description}</small></Link>)}</div>
        </section>:null}

        <section className={styles.moduleSection}>
          <div className={styles.sectionHead}><span>RUANG KERJA</span><h2>Modul yang tersedia</h2></div>
          <div className={styles.moduleGrid}>{capabilities.map(item=><Link href={item.href} className={styles.moduleCard} key={item.title}><strong>{item.title}</strong><span>{item.description}</span><b>Buka →</b></Link>)}</div>
        </section>

        <section className={styles.summaryGrid} aria-label="Konteks akun">
          <Card density="compact"><span className={styles.metricLabel}>Role</span><strong className={styles.metricValue}>{access.role.name}</strong><small className={styles.metricMeta}>{access.permissions.length} hak akses aktif</small></Card>
          <Card density="compact"><span className={styles.metricLabel}>Unit kerja</span><strong className={styles.metricValue}>{access.units.length||1}</strong><small className={styles.metricMeta}>{access.units.map((unit) => unit.name).join(", ") || "Scope organisasi"}</small></Card>
          <Card density="compact"><span className={styles.metricLabel}>Organisasi</span><strong className={styles.metricValue}>{access.organization.code}</strong><small className={styles.metricMeta}>{access.organization.name}</small></Card>
          <Card density="compact"><span className={styles.metricLabel}>Status akun</span><strong className={styles.metricValue}>{access.profile.status}</strong><small className={styles.metricMeta}>{access.user.email}</small></Card>
        </section>

        <Card className={styles.accessCard}>
          <CardHeader title="Konteks akses" description="Informasi teknis dipindahkan ke bagian sekunder agar tidak mengganggu pekerjaan harian." />
          <div className={styles.permissionCloud} aria-label="Permission aktif">
            {visiblePermissions.map((permission) => <span className={styles.permissionItem} key={permission}>{permission}</span>)}
            {access.permissions.length > visiblePermissions.length ? <span className={styles.permissionMore}>+{access.permissions.length - visiblePermissions.length} lainnya</span> : null}
          </div>
        </Card>
      </PageContainer>
    </main>
  );
}
