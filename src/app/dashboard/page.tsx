import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const capabilityMap = [
  { permission: "POS_ACCESS", title: "Kasir & Penjualan", description: "POS, shift, receipt, dan transaksi tunai.", href: "/pos", icon: "▣" },
  { permission: "SAVINGS_ACCOUNT_VIEW", title: "Simpan Pinjam", description: "Rekening, simpanan, pinjaman, dan angsuran.", href: "/simpan-pinjam", icon: "Rp" },
  { permission: "INVENTORY_VIEW", title: "Stok & Gudang", description: "Stok, pergerakan barang, dan stock opname.", href: "/inventory", icon: "□" },
  { permission: "PURCHASE_VIEW", title: "Pembelian", description: "Supplier, PO, penerimaan, dan hutang.", href: "/procurement", icon: "↗" },
  { permission: "FINANCE_VIEW", title: "Keuangan", description: "Kas, bank, jurnal, aset, dan tutup buku.", href: "/finance", icon: "Rp" },
  { permission: "APPROVAL_VIEW", title: "Persetujuan", description: "Antrean pekerjaan yang membutuhkan otorisasi.", href: "/approvals", icon: "✓" },
] as const;

const quickActions = [
  { permission: "POS_ACCESS", label: "Penjualan", description: "Buka kasir", href: "/pos", tone: "blue", icon: "▣" },
  { permission: "SAVINGS_DEPOSIT", label: "Setoran Simpanan", description: "Catat setoran", href: "/savings/accounts?intent=deposit", tone: "green", icon: "+" },
  { permission: "SAVINGS_WITHDRAW", label: "Penarikan", description: "Catat penarikan", href: "/savings/accounts?intent=withdraw", tone: "red", icon: "−" },
  { permission: "LOAN_REPAYMENT_VIEW", label: "Bayar Angsuran", description: "Catat pembayaran", href: "/loans/repayments", tone: "purple", icon: "✓" },
  { permission: "LOAN_APPLICATION_VIEW", label: "Pengajuan Pinjaman", description: "Buat pengajuan", href: "/loans/applications", tone: "blue", icon: "↗" },
  { permission: "PURCHASE_VIEW", label: "Pembelian", description: "Buka procurement", href: "/procurement", tone: "amber", icon: "□" },
] as const;

export default async function DashboardPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");

  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "Pengguna";
  const permissions = new Set(access.permissions);
  const capabilities = capabilityMap.filter((item) => permissions.has(item.permission));
  const actions = quickActions.filter((item) => permissions.has(item.permission));
  const visiblePermissions = access.permissions.slice(0, 8);
  const today = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  const accountContext = (
    <>
      <section className={styles.summaryGrid} aria-label="Konteks akun">
        <Card density="compact"><span className={styles.metricLabel}>Role aktif</span><strong className={styles.metricValue}>{access.role.name}</strong><small className={styles.metricMeta}>{access.permissions.length} hak akses</small></Card>
        <Card density="compact"><span className={styles.metricLabel}>Unit kerja</span><strong className={styles.metricValue}>{access.units.length || 1}</strong><small className={styles.metricMeta}>{access.units.map((unit) => unit.name).join(", ") || "Scope organisasi"}</small></Card>
        <Card density="compact"><span className={styles.metricLabel}>Organisasi</span><strong className={styles.metricValue}>{access.organization.code}</strong><small className={styles.metricMeta}>{access.organization.name}</small></Card>
        <Card density="compact"><span className={styles.metricLabel}>Status akun</span><strong className={styles.metricValue}>{access.profile.status}</strong><small className={styles.metricMeta}>{access.user.email}</small></Card>
      </section>
      <Card className={styles.accessCard}>
        <CardHeader title="Konteks akses" description="Detail teknis untuk pemeriksaan role dan permission akun." />
        <div className={styles.permissionCloud} aria-label="Permission aktif">
          {visiblePermissions.map((permission) => <span className={styles.permissionItem} key={permission}>{permission}</span>)}
          {access.permissions.length > visiblePermissions.length ? <span className={styles.permissionMore}>+{access.permissions.length - visiblePermissions.length} lainnya</span> : null}
        </div>
      </Card>
    </>
  );

  return (
    <main className={styles.page}>
      <PageContainer size="wide">
        <PageHeader eyebrow={access.organization.name} title={`Selamat pagi, ${firstName}`} description={today} />

        <section className={styles.statusBar} aria-label="Status workspace">
          <div><span className={styles.statusDot} /> <strong>Workspace siap digunakan</strong><small>Data dan menu mengikuti hak akses akun.</small></div>
          <span className={styles.roleBadge}>{access.role.name}</span>
        </section>

        {actions.length ? (
          <section className={styles.quickSection}>
            <div className={styles.sectionHead}><span>AKSI UTAMA</span><h2>Apa yang ingin dikerjakan?</h2></div>
            <div className={styles.quickGrid}>
              {actions.map((action) => <Link className={`${styles.quickAction} ${styles[action.tone]}`} href={action.href} key={action.label}>
                <span className={styles.quickIcon}>{action.icon}</span><span><strong>{action.label}</strong><small>{action.description}</small></span><b>→</b>
              </Link>)}
            </div>
          </section>
        ) : null}

        <section className={styles.moduleSection}>
          <div className={styles.sectionHead}><span>RUANG KERJA</span><h2>Modul yang tersedia</h2></div>
          <div className={styles.moduleGrid}>
            {capabilities.map((item) => <Link href={item.href} className={styles.moduleCard} key={item.title}>
              <span className={styles.moduleIcon}>{item.icon}</span><strong>{item.title}</strong><span className={styles.moduleDescription}>{item.description}</span><b>Buka modul →</b>
            </Link>)}
          </div>
        </section>

        <div className={styles.desktopContext}>{accountContext}</div>
        <details className={styles.mobileContext}>
          <summary>Detail akun & akses <span>{access.role.name}</span></summary>
          <div className={styles.mobileContextBody}>{accountContext}</div>
        </details>
      </PageContainer>
    </main>
  );
}
