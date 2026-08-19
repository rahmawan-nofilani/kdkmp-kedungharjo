import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift } from "@/lib/d1/teller";
import { ensurePosFoundation,getPrimaryWarehouse,listRecentSales,listSaleProducts } from "@/lib/d1/pos";
import { createClient } from "@/lib/supabase/server";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PosTerminal } from "./pos-terminal";
import shell from "./pos-shell.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string;sale?:string;receipt?:string;total?:string;duplicate?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}

export default async function PosPage({searchParams}:PageProps){
  const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("POS_ACCESS"))redirect("/dashboard");
  const d1=await getD1SchemaStatus();if(!d1.initialized)redirect("/setup/database");
  const shift=await getOpenShift(access.organization.id,access.user.id);if(!shift)redirect("/teller?error=POS membutuhkan shift teller OPEN.");
  await ensurePosFoundation();const warehouse=await getPrimaryWarehouse(access.organization.id);if(!warehouse)redirect("/inventory?error=Gudang aktif belum tersedia.");
  const params=await searchParams;const supabase=await createClient();
  const [products,recentSales,memberResult]=await Promise.all([listSaleProducts(access.organization.id,warehouse.id),listRecentSales(access.organization.id,access.user.id,8),supabase.from("members").select("id,member_number,full_name").eq("organization_id",access.organization.id).eq("status","ACTIVE").order("member_number",{ascending:true}).limit(250)]);
  const members=memberResult.data??[];const activeProducts=products.filter((product)=>!product.track_stock||product.stock_qty>0);const successTotal=Number(params.total??"0");

  return <PageContainer size="full">
    <PageHeader eyebrow="Penjualan · POS" title="Kasir" description="Penjualan tunai dengan posting stok, pembayaran, jurnal, audit, dan idempotency dalam satu transaction batch." actions={<div className={shell.statusRow}><Badge tone="success">SHIFT OPEN</Badge><Badge tone="info">CASH ONLY</Badge><Badge>{access.role.name}</Badge></div>}/>

    {params.status==="success"?<Alert tone="success" title={params.duplicate?"Transaksi duplikat dicegah":"Transaksi berhasil"}>{params.sale?<><Link href={`/sales/${params.sale}`}>{params.receipt||"Buka struk transaksi"}</Link> · {rupiah(successTotal)}</>:<>{params.receipt||"Receipt tersimpan"} · {rupiah(successTotal)}</>}</Alert>:null}
    {params.error?<Alert tone="danger" title="Transaksi belum dapat diproses">{params.error}</Alert>:null}

    <Card className={shell.sectionSpace} density="compact"><div className={shell.contextGrid}><div className={shell.contextItem}><span>Organisasi</span><strong>{access.organization.name}</strong><small>{access.role.name}</small></div><div className={shell.contextItem}><span>Gudang aktif</span><strong>{warehouse.code} · {warehouse.name}</strong><small>{activeProducts.length} produk siap dijual</small></div><div className={shell.contextItem}><span>Kas awal shift</span><strong>{rupiah(shift.opening_cash_amount)}</strong><small>Shift teller aktif</small></div></div></Card>

    <div className={shell.sectionSpace}><PosTerminal products={products} members={members} warehouseName={warehouse.name}/></div>

    <Card className={shell.sectionSpace}>
      <div className={shell.recentHeader}><div><h2>Transaksi terakhir teller ini</h2><p>Audit cepat untuk receipt dan status pembayaran terbaru.</p></div><Link href="/reports/daily-sales">Buka laporan harian →</Link></div>
      {recentSales.length?<div className={shell.recentGrid}>{recentSales.map((sale)=><Link className={shell.recentCard} href={`/sales/${sale.id}`} key={sale.id}><span>{sale.receipt_number}</span><strong>{rupiah(sale.total_amount)}</strong><small>{new Date(sale.sold_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} · {sale.payment_status}</small></Link>)}</div>:<div className={shell.empty}>Belum ada penjualan pada teller ini.</div>}
    </Card>
  </PageContainer>;
}
