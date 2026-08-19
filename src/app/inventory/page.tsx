import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listProductsWithStock,listRecentInventoryMovements,listWarehouses } from "@/lib/d1/inventory";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SensitiveAction } from "@/components/domain/transaction-components";
import { createDefaultWarehouseAction,createProductAction,postOpeningStockAction,postStockAdjustmentAction } from "./actions";
import styles from "./inventory.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function timestamp(value:string){return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"})}
function movementLabel(type:string){const labels:Record<string,string>={OPENING:"Saldo awal",PURCHASE_RECEIPT:"Penerimaan",SALE:"Penjualan",SALE_VOID:"Void masuk",ADJUSTMENT_IN:"Koreksi +",ADJUSTMENT_OUT:"Koreksi −",TRANSFER_IN:"Transfer masuk",TRANSFER_OUT:"Transfer keluar"};return labels[type]??type}

export default async function InventoryPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("INVENTORY_VIEW"))redirect("/dashboard");
 const d1=await getD1SchemaStatus();if(!d1.initialized)redirect("/setup/database");
 const params=await searchParams;const [products,warehouses,movements]=await Promise.all([listProductsWithStock(access.organization.id),listWarehouses(access.organization.id),listRecentInventoryMovements(access.organization.id,80)]);
 const canManage=access.permissions.includes("ORG_MANAGE");const stockProducts=products.filter((product)=>product.track_stock);const stockUnits=products.reduce((sum,item)=>sum+Number(item.stock_qty||0),0);const stockValue=products.reduce((sum,item)=>sum+Math.max(0,Number(item.stock_qty||0))*Number(item.cost_amount||0),0);const negativeStocks=stockProducts.filter((item)=>item.stock_qty<0).length;
 return <PageContainer size="full">
  <PageHeader eyebrow="Operasional · Inventory" title="Stok & Gudang" description="Pantau stok, produk, dan pergerakan barang. Tindakan master dan koreksi dibuka hanya saat diperlukan." actions={<Link className={styles.primaryButton} href="/inventory/opname">Stock Opname</Link>}/>
  {params.status==="warehouse-ready"?<Alert tone="success" title="Gudang siap">Gudang utama berhasil disiapkan.</Alert>:null}
  {params.status==="product-created"?<Alert tone="success" title="Produk dibuat">Produk berhasil dibuat.</Alert>:null}
  {params.status==="stock-posted"?<Alert tone="success" title="Saldo awal diposting">Saldo awal masuk ke inventory ledger.</Alert>:null}
  {params.status==="stock-adjusted"?<Alert tone="success" title="Koreksi diposting">Movement koreksi dan audit trail berhasil dibuat.</Alert>:null}
  {params.error?<Alert tone="danger" title="Inventory belum dapat diproses">{params.error}</Alert>:null}

  <section className={styles.metrics}>
   <Card density="compact"><span>Produk</span><strong>{products.length}</strong><small>master produk</small></Card>
   <Card density="compact"><span>Gudang</span><strong>{warehouses.length}</strong><small>lokasi stok</small></Card>
   <Card density="compact"><span>Total unit</span><strong>{stockUnits}</strong><small>saldo movement</small></Card>
   <Card density="compact" className={negativeStocks?styles.metricAlert:undefined}><span>Nilai stok</span><strong>{rupiah(stockValue)}</strong><small>{negativeStocks?`${negativeStocks} saldo negatif perlu diperiksa`:"estimasi berdasarkan HPP"}</small></Card>
  </section>

  {warehouses.length===0?<Card className={styles.setupCard}><div><span className={styles.kicker}>Persiapan gudang</span><h3>Belum ada gudang.</h3><p>Buat Gudang Utama sebelum posting saldo awal.</p></div>{canManage?<form action={createDefaultWarehouseAction}><button type="submit">Buat Gudang Utama</button></form>:null}</Card>:null}

  <section className={styles.mainGrid}>
   <Card className={styles.panel}><div className={styles.panelHeader}><div><span className={styles.kicker}>Master produk</span><h3>Daftar Produk</h3></div><Badge>{products.length} item</Badge></div>
    {products.length===0?<div className={styles.empty}>Belum ada produk.</div>:<><div className={styles.tableWrap}><table><thead><tr><th>SKU / Produk</th><th>Harga</th><th>Stok</th><th>Status</th></tr></thead><tbody>{products.map((product)=><tr key={product.id}><td><strong>{product.name}</strong><span>{product.sku}{product.barcode?` · ${product.barcode}`:""}</span></td><td><strong>{rupiah(product.sell_amount)}</strong><span>HPP {rupiah(product.cost_amount)}</span></td><td><strong className={product.stock_qty<0?styles.negativeStock:undefined}>{product.track_stock?product.stock_qty:"—"}</strong><span>{product.unit_name}</span></td><td><Badge tone={product.status==="ACTIVE"?"success":"neutral"}>{product.status}</Badge></td></tr>)}</tbody></table></div><div className={styles.mobileList}>{products.map((product)=><article className={styles.mobileCard} key={product.id}><div><span>{product.sku}</span><strong>{product.name}</strong><small>{product.status}</small></div><div className={styles.mobileCardNumbers}><strong>{rupiah(product.sell_amount)}</strong><span className={product.stock_qty<0?styles.negativeStock:undefined}>Stok {product.track_stock?product.stock_qty:"—"} {product.unit_name}</span></div></article>)}</div></>}
   </Card>

   {canManage?<aside className={styles.sideStack}>
    <details className={styles.actionDisclosure}><summary><span><strong>Tambah Produk</strong><small>Master produk baru</small></span><b>+</b></summary><div className={styles.actionBody}><form action={createProductAction} className={styles.form}><label>SKU<input name="sku" required placeholder="BRG-001"/></label><label>Nama produk<input name="name" required placeholder="Beras Premium 5 Kg"/></label><label>Barcode<input name="barcode" placeholder="Opsional"/></label><div className={styles.twoCols}><label>Satuan<input name="unitName" defaultValue="pcs" required/></label><label>HPP<input name="costAmount" inputMode="numeric" defaultValue="0" required/></label></div><label>Harga jual<input name="sellAmount" inputMode="numeric" defaultValue="0" required/></label><div className={styles.checks}><label><input type="checkbox" name="trackStock" defaultChecked/> Lacak stok</label><label><input type="checkbox" name="trackExpiry"/> Lacak kedaluwarsa</label></div><button type="submit">Simpan Produk</button></form></div></details>

    <details className={styles.actionDisclosure}><summary><span><strong>Saldo Awal</strong><small>Hanya untuk produk tanpa movement</small></span><b>+</b></summary><div className={styles.actionBody}><p className={styles.formNote}>Setelah produk memiliki movement, gunakan Koreksi Stok terkontrol.</p><form action={postOpeningStockAction} className={styles.form}><label>Gudang<select name="warehouseId" required defaultValue=""><option value="" disabled>Pilih gudang</option>{warehouses.map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label>Produk<select name="productId" required defaultValue=""><option value="" disabled>Pilih produk</option>{stockProducts.map((product)=><option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><div className={styles.twoCols}><label>Qty<input name="quantity" type="number" min="1" step="1" required/></label><label>HPP/unit<input name="unitCostAmount" inputMode="numeric" defaultValue="0" required/></label></div><label>Batch/lot<input name="batchCode" placeholder="Opsional"/></label><label>Kedaluwarsa<input name="expiryDate" type="date"/></label><button type="submit" disabled={!warehouses.length||!stockProducts.length}>Posting Saldo Awal</button></form></div></details>

    <SensitiveAction summary="Koreksi Stok" impact={<><strong>Dampak tindakan</strong><span>Sistem membuat movement ADJUSTMENT_IN/OUT baru tanpa menghapus movement sebelumnya. Alasan wajib disimpan.</span></>} note="Gunakan untuk koreksi hasil hitung fisik/operasional yang dapat dijelaskan."><form action={postStockAdjustmentAction} className={styles.form}><label>Gudang<select name="warehouseId" required defaultValue=""><option value="" disabled>Pilih gudang</option>{warehouses.filter((warehouse)=>warehouse.status==="ACTIVE").map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label>Produk<select name="productId" required defaultValue=""><option value="" disabled>Pilih produk</option>{stockProducts.filter((product)=>product.status==="ACTIVE").map((product)=><option key={product.id} value={product.id}>{product.sku} · {product.name} · stok {product.stock_qty}</option>)}</select></label><div className={styles.twoCols}><label>Arah<select name="direction" defaultValue="OUT" required><option value="OUT">Keluar / minus</option><option value="IN">Masuk / plus</option></select></label><label>Qty<input name="quantity" type="number" min="1" step="1" required/></label></div><label>Alasan<textarea name="reason" minLength={8} maxLength={200} required placeholder="Contoh: koreksi hasil hitung fisik rak depan"/></label><div className={styles.twoCols}><label>Batch/lot<input name="batchCode" placeholder="Opsional"/></label><label>Kedaluwarsa<input name="expiryDate" type="date"/></label></div><button type="submit" disabled={!warehouses.length||!stockProducts.length}>Posting Koreksi</button></form></SensitiveAction>
   </aside>:null}
  </section>

  <Card className={`${styles.panel} ${styles.movementPanel}`}><div className={styles.panelHeader}><div><span className={styles.kicker}>Kartu stok</span><h3>Pergerakan Terakhir</h3></div><Badge>{movements.length}</Badge></div>
   {movements.length?<><div className={styles.tableWrap}><table className={styles.movementTable}><thead><tr><th>Waktu</th><th>Produk</th><th>Gudang</th><th>Movement</th><th>Qty</th><th>HPP</th><th>Batch / Expiry</th></tr></thead><tbody>{movements.map((movement)=><tr key={movement.id}><td><strong>{timestamp(movement.occurred_at)}</strong><span>{movement.reference_type||"—"}</span></td><td><strong>{movement.product_name}</strong><span>{movement.sku}</span></td><td><strong>{movement.warehouse_code}</strong><span>{movement.warehouse_name}</span></td><td><Badge tone={movement.quantity_delta>=0?"success":"warning"}>{movementLabel(movement.movement_type)}</Badge></td><td><strong className={movement.quantity_delta>=0?styles.qtyIn:styles.qtyOut}>{movement.quantity_delta>0?"+":""}{movement.quantity_delta}</strong></td><td><strong>{rupiah(movement.unit_cost_amount)}</strong></td><td><strong>{movement.batch_code||"—"}</strong><span>{movement.expiry_date||"Tanpa expiry"}</span></td></tr>)}</tbody></table></div><div className={styles.mobileList}>{movements.map((movement)=><article className={styles.mobileMovement} key={movement.id}><div className={styles.mobileMovementHead}><div><span>{timestamp(movement.occurred_at)}</span><strong>{movement.product_name}</strong><small>{movement.sku} · {movement.warehouse_code}</small></div><strong className={movement.quantity_delta>=0?styles.qtyIn:styles.qtyOut}>{movement.quantity_delta>0?"+":""}{movement.quantity_delta}</strong></div><div className={styles.mobileMovementMeta}><span>{movementLabel(movement.movement_type)}</span><span>{rupiah(movement.unit_cost_amount)}</span></div></article>)}</div></>:<div className={styles.empty}>Belum ada inventory movement.</div>}
  </Card>
 </PageContainer>;
}
