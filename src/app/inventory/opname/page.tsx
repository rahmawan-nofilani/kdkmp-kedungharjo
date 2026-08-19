import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listProductsWithStock,listWarehouses } from "@/lib/d1/inventory";
import { listExpiryCandidates,listInventoryPolicies,listLowStockExceptions,listStockOpnameSessions } from "@/lib/d1/opname";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createStockOpnameAction,saveInventoryPolicyAction } from "./actions";
import styles from "./opname.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string}>};
function timestamp(value:string|null){if(!value)return"—";return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})}
function sessionTone(status:string):"success"|"warning"|"info"|"danger"|"neutral"{if(status==="POSTED")return"success";if(status==="CANCELLED")return"neutral";if(status==="COUNTED"||status==="SUBMITTED"||status==="APPROVED")return"warning";return"info"}

export default async function StockOpnamePage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("INVENTORY_VIEW"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.current)redirect("/setup/database");
 const params=await searchParams;const canManage=access.permissions.includes("ORG_MANAGE");
 const [warehouses,products,policies,lowStock,expiryCandidates,sessions]=await Promise.all([listWarehouses(access.organization.id),listProductsWithStock(access.organization.id),listInventoryPolicies(access.organization.id),listLowStockExceptions(access.organization.id),listExpiryCandidates(access.organization.id),listStockOpnameSessions(access.organization.id,30)]);
 const activeSessions=sessions.filter((item)=>!["POSTED","CANCELLED"].includes(item.status));const trackedProducts=products.filter((product)=>product.track_stock&&product.status==="ACTIVE");
 return <PageContainer size="wide">
  <PageHeader eyebrow="Operasional · Inventory" title="Stock Opname" description="Hitung fisik memakai snapshot stok sistem. Selisih tidak mengubah stok secara langsung; adjustment hanya diposting setelah flow kontrol selesai." actions={<Link className={styles.detailLink} href="/inventory">Kembali ke Inventory</Link>}/>
  {params.status==="policy-saved"?<Alert tone="success" title="Policy disimpan">Inventory policy berhasil diperbarui.</Alert>:null}
  {params.status==="cancelled"?<Alert tone="success" title="Sesi dibatalkan">Sesi stock opname dibatalkan dan audit event tercatat.</Alert>:null}
  {params.error?<Alert tone="danger" title="Stock opname belum dapat diproses">{params.error}</Alert>:null}

  <section className={styles.metrics}>
   <Card density="compact"><span>Low stock</span><strong>{lowStock.length}</strong><small>berdasarkan min-stock policy</small></Card>
   <Card density="compact"><span>Expiry candidate</span><strong>{expiryCandidates.length}</strong><small>incoming expiry records</small></Card>
   <Card density="compact"><span>Opname aktif</span><strong>{activeSessions.length}</strong><small>belum POSTED/CANCELLED</small></Card>
   <Card density="compact"><span>Policy terpasang</span><strong>{policies.length}</strong><small>produk × gudang</small></Card>
  </section>

  <section className={styles.exceptionGrid}>
   <Card className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>LOW STOCK / REORDER</span><h2>Stok di bawah batas minimum</h2></div><Badge tone={lowStock.length?"warning":"success"}>{lowStock.length?`${lowStock.length} CHECK`:"CLEAR"}</Badge></div>{lowStock.length?<div className={styles.exceptionList}>{lowStock.slice(0,12).map((row)=><div className={styles.exceptionRow} key={row.id}><div><strong>{row.sku} · {row.product_name}</strong><span>{row.warehouse_code} · minimum {row.min_stock_qty}</span></div><div className={styles.exceptionValue}><strong>{row.stock_qty}</strong><span>reorder {row.reorder_qty}</span></div></div>)}</div>:<div className={styles.empty}>Belum ada produk yang melewati min-stock policy.</div>}</Card>
   <Card className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>EXPIRY WATCH</span><h2>Incoming records mendekati expiry</h2></div><Badge tone={expiryCandidates.length?"warning":"success"}>{expiryCandidates.length?`${expiryCandidates.length} WATCH`:"CLEAR"}</Badge></div>{expiryCandidates.length?<div className={styles.exceptionList}>{expiryCandidates.slice(0,12).map((row)=><div className={styles.exceptionRow} key={row.movement_id}><div><strong>{row.sku} · {row.product_name}</strong><span>{row.warehouse_code} · batch {row.batch_code||"—"}</span></div><div className={styles.exceptionValue}><strong>{row.expiry_date}</strong><span>warning {row.warning_days} hari</span></div></div>)}</div>:<div className={styles.empty}>Tidak ada incoming expiry record dalam warning window.</div>}<p className={styles.disclaimer}>Expiry watch membaca incoming movement yang memiliki expiry date. Ini belum diklaim sebagai remaining quantity per batch sampai lot-allocation/FEFO engine tersedia.</p></Card>
  </section>

  {canManage?<section className={styles.controlGrid}>
   <Card className={styles.panel}><span className={styles.kicker}>INVENTORY POLICY</span><h2>Atur min-stock & reorder</h2><form action={saveInventoryPolicyAction} className={styles.form}><label>Gudang<select name="warehouseId" required defaultValue=""><option value="" disabled>Pilih gudang</option>{warehouses.map((warehouse)=><option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label>Produk<select name="productId" required defaultValue=""><option value="" disabled>Pilih produk tracked-stock</option>{trackedProducts.map((product)=><option value={product.id} key={product.id}>{product.sku} · {product.name}</option>)}</select></label><div className={styles.threeCols}><label>Min stok<input name="minStockQty" type="number" min="0" step="1" defaultValue="0" required/></label><label>Reorder qty<input name="reorderQty" type="number" min="0" step="1" defaultValue="0" required/></label><label>Expiry warning<input name="expiryWarningDays" type="number" min="0" step="1" defaultValue="30" required/></label></div><button type="submit">Simpan Policy</button></form></Card>
   <Card className={`${styles.panel} ${styles.opnameStart}`}><span className={styles.kicker}>NEW STOCK OPNAME</span><h2>Buat snapshot hitung fisik</h2><p>Satu gudang hanya boleh memiliki satu sesi opname aktif. Snapshot tidak mengunci POS, tetapi posting ditolak bila stok berubah selama proses hitung.</p><form action={createStockOpnameAction} className={styles.form}><label>Gudang<select name="warehouseId" required defaultValue=""><option value="" disabled>Pilih gudang</option>{warehouses.map((warehouse)=><option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label>Catatan<input name="notes" maxLength={240} placeholder="Contoh: Opname akhir bulan / rak gerai utama"/></label><button type="submit">Buat Sesi Stock Opname</button></form></Card>
  </section>:null}

  <Card className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>OPNAME HISTORY</span><h2>Sesi stock opname</h2></div><Badge>{sessions.length} sesi</Badge></div>{sessions.length?<div className={styles.tableWrap}><table><thead><tr><th>Nomor / Gudang</th><th>Status</th><th>Progress</th><th>Selisih</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>{sessions.map((session)=><tr key={session.id}><td><strong>{session.session_number}</strong><span>{session.warehouse_code} · {session.warehouse_name}</span></td><td><Badge tone={sessionTone(session.status)}>{session.status}</Badge></td><td><strong>{session.counted_line_count}/{session.line_count}</strong><span>produk dihitung</span></td><td><strong>{session.variance_line_count}</strong><span>baris variance</span></td><td>{timestamp(session.created_at)}</td><td><Link className={styles.detailLink} href={`/inventory/opname/${session.id}`}>Buka detail</Link></td></tr>)}</tbody></table></div>:<div className={styles.empty}>Belum ada sesi stock opname.</div>}</Card>
 </PageContainer>;
}
