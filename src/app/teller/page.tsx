import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift,getTellerReadiness } from "@/lib/d1/teller";
import { createClient } from "@/lib/supabase/server";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { MoneyValue } from "@/components/ui/money-value";
import { closeShiftAction,openShiftAction } from "./actions";
import styles from "./teller.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string;variance?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}

export default async function TellerPage({searchParams}:PageProps){
  const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("POS_ACCESS"))redirect("/dashboard");
  const params=await searchParams;const supabase=await createClient();
  const [{count:memberCount},d1]=await Promise.all([supabase.from("members").select("id",{count:"exact",head:true}).eq("organization_id",access.organization.id).eq("status","ACTIVE"),getD1SchemaStatus()]);
  const [readiness,openShift]=d1.initialized?await Promise.all([getTellerReadiness(access.organization.id),getOpenShift(access.organization.id,access.user.id)]):[{products:0,warehouses:0,movements:0,inventoryReady:false},null];
  const shiftReady=Boolean(openShift);const posFoundationReady=d1.initialized&&readiness.inventoryReady&&shiftReady;const variance=Number(params.variance??"0");

  return <PageContainer size="wide">
    <PageHeader eyebrow="Penjualan · Teller" title="Kasir & Shift" description="Kontrol kas teller, readiness POS, dan rekonsiliasi shift dengan data transaksi aktual." actions={<div className={styles.headerBadges}><Badge tone={shiftReady?"success":"warning"}>{shiftReady?"SHIFT OPEN":"SHIFT CLOSED"}</Badge><Badge>{access.role.name}</Badge></div>}/>
    {params.status==="shift-opened"?<Alert tone="success" title="Shift dibuka">POS sekarang siap digunakan selama readiness inventory tetap PASS.</Alert>:null}
    {params.status==="shift-closed"?<Alert tone={variance===0?"success":"warning"} title="Shift ditutup">Selisih kas: {rupiah(variance)}.</Alert>:null}
    {params.error?<Alert tone="danger" title="Proses teller gagal">{params.error}</Alert>:null}
    <div className={styles.grid}>
      <Card>
        <div className={styles.sectionHeading}><div><span>LAYANAN TELLER</span><h2>Anggota & kas harian</h2><p>Cari anggota, cek kesiapan inventory, lalu buka POS hanya saat shift aktif.</p></div>{posFoundationReady?<Link className={styles.primaryLink} href="/pos">Buka POS</Link>:null}</div>
        <form className={styles.lookup} action="/members" method="get"><input name="q" placeholder="Nomor anggota, nama, telepon, atau kode KK..." aria-label="Cari anggota"/><button type="submit">Cari Anggota</button></form>
        <div className={styles.quickGrid}><Link className={styles.quick} href="/members"><span>Member Registry</span><strong>{memberCount??0} anggota aktif</strong></Link><Link className={styles.quick} href="/inventory"><span>Product & Inventory</span><strong>{readiness.products} produk · {readiness.warehouses} gudang</strong></Link>{posFoundationReady?<Link className={styles.quick} href="/pos"><span>Cash Drawer</span><strong>OPEN · Buka POS</strong></Link>:<div className={styles.quick}><span>Cash Drawer</span><strong>{openShift?`OPEN · ${rupiah(openShift.opening_cash_amount)}`:"CLOSED"}</strong></div>}</div>
        <section className={styles.shiftPanel}><div><span className={styles.kicker}>CASH CONTROL</span><h2>{openShift?"Shift sedang OPEN":"Buka Shift Teller"}</h2>{openShift?<p>Shift dibuka {new Date(openShift.opened_at).toLocaleString("id-ID")} dengan kas awal <MoneyValue value={openShift.opening_cash_amount}/>. Closing memeriksa integritas transaksi sebelum status CLOSED.</p>:<p>Kas awal wajib dicatat sebelum POS menerima transaksi tunai.</p>}</div>{openShift?<form action={closeShiftAction} className={styles.shiftForm}><label>Kas fisik saat tutup<input name="countedCashAmount" inputMode="numeric" defaultValue="0" required/></label><button type="submit" className={styles.closeButton}>Rekonsiliasi & Tutup Shift</button></form>:<form action={openShiftAction} className={styles.shiftForm}><label>Kas awal<input name="openingCashAmount" inputMode="numeric" defaultValue="0" required/></label><button type="submit" disabled={!readiness.inventoryReady}>Buka Shift</button></form>}</section>
      </Card>
      <Card>
        <div className={styles.sectionHeading}><div><span>READINESS</span><h2>Gate transaksi</h2><p>Semua ledger pendukung harus siap sebelum transaksi tunai diposting.</p></div></div>
        <div className={styles.readiness}><div><span>Authentication & RBAC</span><Badge tone="success">READY</Badge></div><div><span>Member master</span><Badge tone="success">READY</Badge></div><div><span>D1 transaction database</span><Badge tone={d1.initialized?"success":d1.bound?"warning":"danger"}>{d1.initialized?"READY":d1.bound?"INITIALIZE":"PROVISIONING"}</Badge></div><div><span>Product & inventory ledger</span><Badge tone={readiness.inventoryReady?"success":d1.initialized?"warning":"danger"}>{readiness.inventoryReady?"READY":d1.initialized?"SETUP":"BLOCKED"}</Badge></div><div><span>Cash drawer & shift</span><Badge tone={shiftReady?"success":readiness.inventoryReady?"warning":"danger"}>{shiftReady?"OPEN":readiness.inventoryReady?"READY TO OPEN":"BLOCKED"}</Badge></div><div><span>POS commit + journal</span><Badge tone={posFoundationReady?"success":"danger"}>{posFoundationReady?"READY":"BLOCKED"}</Badge></div></div>
        {!readiness.inventoryReady?<p className={styles.note}>Buka Inventory dan pastikan gudang, produk aktif, serta opening stock tersedia.</p>:!openShift?<p className={styles.note}>Inventory sudah siap. Buka shift teller untuk mengaktifkan POS.</p>:<p className={styles.note}>POS siap. Closing tetap menjadi reconciliation gate sebelum shift berstatus CLOSED.</p>}
      </Card>
    </div>
  </PageContainer>;
}
