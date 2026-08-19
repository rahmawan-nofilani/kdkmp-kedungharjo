import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const capabilityMap = [
  { permission: "POS_ACCESS", title: "Penjualan & Teller", description: "Kasir, shift, receipt, dan transaksi tunai." },
  { permission: "INVENTORY_VIEW", title: "Inventory", description: "Stok, gudang, movement, dan stock opname." },
  { permission: "PURCHASE_VIEW", title: "Procurement", description: "Supplier, purchase request, PO, dan receiving." },
  { permission: "FINANCE_VIEW", title: "Keuangan", description: "Kas & bank, jurnal, laporan, aset, dan closing." },
  { permission: "SAVINGS_ACCOUNT_VIEW", title: "Simpanan", description: "Produk, rekening, mutasi, dan integritas simpanan." },
  { permission: "LOAN_APPLICATION_VIEW", title: "Pinjaman", description: "Pengajuan, kontrak, angsuran, dan rekonsiliasi." },
] as const;

export default async function DashboardPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const firstName = access.profile.fullName.trim().split(/\s+/)[0] || "Pengguna";
  const permissions = new Set(access.permissions);
  const capabilities = capabilityMap.filter((item) => permissions.has(item.permission));
  const visiblePermissions = access.permissions.slice(0, 18);

  return (
    <main className={styles.page}>
      <PageContainer>
        <PageHeader
          eyebrow={access.organization.name}
          title={`Selamat datang, ${firstName}`}
          description="Ringkasan konteks akses dan ruang kerja yang tersedia untuk akun aktif Anda."
        />

        <section className={styles.summaryGrid} aria-label="Ringkasan akun">
          <Card density="compact"><span className={styles.metricLabel}>Organisasi</span><strong className={styles.metricValue}>{access.organization.name}</strong><small className={styles.metricMeta}>{access.organization.code}</small></Card>
          <Card density="compact"><span className={styles.metricLabel}>Unit kerja</span><strong className={styles.metricValue}>{access.units.length}</strong><small className={styles.metricMeta}>{access.units.map((unit) => unit.name).join(", ") || "Scope organisasi"}</small></Card>
          <Card density="compact"><span className={styles.metricLabel}>Hak akses</span><strong className={styles.metricValue}>{access.permissions.length}</strong><small className={styles.metricMeta}>Berdasarkan role {access.role.name}</small></Card>
          <Card density="compact"><span className={styles.metricLabel}>Status akun</span><strong className={styles.metricValue}>{access.profile.status}</strong><small className={styles.metricMeta}>{access.user.email}</small></Card>
        </section>

        <section className={styles.contentGrid}>
          <Card>
            <CardHeader title="Ruang kerja Anda" description="Modul ditampilkan dari permission aktual akun ini, bukan data contoh design board." />
            <ul className={styles.scopeList}>
              {capabilities.map((item) => (
                <li key={item.title}>
                  <span className={styles.scopeDot} aria-hidden="true" />
                  <div><strong>{item.title}</strong><span>{item.description}</span></div>
                </li>
              ))}
              {!capabilities.length ? <li><span className={styles.scopeDot} aria-hidden="true" /><div><strong>Akses terbatas</strong><span>Gunakan navigasi yang tersedia sesuai permission akun.</span></div></li> : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Konteks akses" description={`${access.role.name} · ${access.units.length ? `${access.units.length} unit scope` : "organization scope"}`} />
            <div className={styles.permissionCloud} aria-label="Permission aktif">
              {visiblePermissions.map((permission) => <span className={styles.permissionItem} key={permission}>{permission}</span>)}
              {access.permissions.length > visiblePermissions.length ? <span className={styles.permissionMore}>+{access.permissions.length - visiblePermissions.length} lainnya</span> : null}
            </div>
          </Card>
        </section>
      </PageContainer>
    </main>
  );
}
