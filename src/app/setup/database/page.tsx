import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { initializeD1 } from "./actions";
import styles from "./setup.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string;detail?:string}>};

export default async function DatabaseSetupPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("ORG_MANAGE"))redirect("/dashboard");const params=await searchParams;const status=await getD1SchemaStatus();
 const rows=[["V1","Inti Transaksi",status.features.transactionCore],["V2","Kontrol Stok",status.features.inventoryControl],["V3","Pembelian",status.features.procurement],["V4","Akuntansi Pembelian",status.features.procurementAccounting],["V5","Daftar Akun",status.features.accountingConfig],["V6","Mapping Akuntansi",status.features.accountingRuntime],["V7","Kas, Bank & Periode",status.features.treasuryPeriod],["V8","Jurnal Terkontrol",status.features.controlledJournal],["V9","Aset & Penyusutan",status.features.assetDepreciation],["V10","Kapasitas Sistem",status.features.systemCapacity],["V11","Ledger Simpanan",status.features.savingsLedger]] as const;
 return <PageContainer size="normal">
  <PageHeader eyebrow="Pengaturan · D1" title="Database Transaksi" description="Upgrade menambah kemampuan baru tanpa menghapus transaksi lama. Hanya Manager dengan ORG_MANAGE yang dapat menjalankan upgrade." actions={<Link href="/dashboard">Dashboard</Link>}/>
  {params.status?<Alert tone="success">Proses database selesai. Periksa status CURRENT di bawah.</Alert>:null}{params.error?<Alert tone="danger">Upgrade belum berhasil. {params.detail||"Coba lagi setelah memastikan deployment terbaru aktif."}</Alert>:null}
  <section className={styles.statusGrid}><Card density="compact"><span>D1 binding</span><Badge tone={status.bound?"success":"warning"}>{status.bound?"CONNECTED":"WAITING DEPLOY"}</Badge></Card><Card density="compact"><span>Kesiapan schema</span><Badge tone={status.current?"success":"warning"}>{status.current?"CURRENT":status.initialized?"UPGRADE REQUIRED":"NOT INITIALIZED"}</Badge><small>{status.currentVersion||"Belum ada schema"}</small></Card></section>
  <Card className={styles.card}><div className={styles.steps}><div><b>VERSI</b><span>{status.currentVersion||"Belum ada schema"}</span></div>{rows.map(([code,label,ready])=><div key={code}><b>{code}</b><span>{ready?`${label} tersedia`:`${label} menunggu upgrade`}</span><Badge tone={ready?"success":"warning"}>{ready?"READY":"PENDING"}</Badge></div>)}</div></Card>
  <Card className={styles.card}><div className={styles.actions}>{!status.current?<form action={initializeD1}><button type="submit" disabled={!status.bound}>Terapkan Upgrade yang Tertunda</button></form>:<Link href="/savings/accounts">Buka Rekening Simpanan</Link>}<Link href="/capacity">Kapasitas Sistem</Link><Link href="/readiness">Kesiapan Rilis</Link></div><p className={styles.note}>Aksi upgrade tetap menggunakan jalur database yang sama; migrasi desain tidak mengubah schema atau urutan upgrade.</p></Card>
 </PageContainer>;
}
