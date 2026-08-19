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
import { InventoryIcon,PosIcon,ReceivingIcon,ReversalIcon } from "@/components/ui/icons";
import { createDefaultWarehouseAction,createProductAction,postOpeningStockAction,postStockAdjustmentAction } from "./actions";
import styles from "./inventory.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function timestamp(value:string){return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"})}
function movementLabel(type:string){const labels:Record<string,string>={OPENING:"Saldo Awal",PURCHASE_RECEIPT:"Penerimaan Barang",SALE:"Penjualan",SALE_VOID:"Pembatalan Penjualan",ADJUSTMENT_IN:"Koreksi Stok Masuk",ADJUSTMENT_OUT:"Koreksi Stok Keluar",TRANSFER_IN:"Transfer Masuk",TRANSFER_OUT:"Transfer Keluar"};return labels[type]??type}
function MovementIcon({type}:{type:string}){if(type==="PURCHASE_RECEIPT"||type==="OPENING"||type==="TRANSFER_IN")return <ReceivingIcon size={18}/>;if(type==="SALE")return <PosIcon size={18}/>;if(type==="SALE_VOID")return <ReversalIcon size={18}/>;return <InventoryIcon size={18}/>}

export default async function InventoryPage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("INVENTORY_VIEW"))redirect("/dashboard");
 const d1=await getD1SchemaStatus();if(!d1.initialized)redirect("/setup/database");
 const params=await searchParams;const [products,warehouses,movements]=await Promise.all([listProductsWithStock(access.organization.id),listWarehouses(access.organization.id),listRecentInventoryMovements(access.organization.id,80)]);
 const canManage=access.permissions.includes("ORG_MANAGE");const stockProducts=products.filter((product)=>product.track_stock);const stockUnits=products.reduce((sum,item)=>sum+Number(item.stock_qty||0),0);const stockValue=products.reduce((sum,item)=>sum+Math.max(0,Number(item.stock_qty||0))*Number(item.cost_amount||0),0);const negativeStocks=stockProducts.filter((item)=>item.stock_qty<0).length;const lowStocks=stockProducts.filter(item=>item.stock_qty>=0&&item.stock_qty<=5).length;
 return <PageContainer size="full">
  <PageHeader eyebrow="Operasional" title="Stok & Gudang" description="Pantau produk, stok tersedia, barang masuk, barang keluar, dan koreksi stok." actions={<Link className={styles.primaryButton} href="/inventory/opname">Stock Opname</Link>}/>
  {params.status==="warehouse-ready"?<Alert tone="success" title="Gudang siap">Gudang utama berhasil disiapkan.</Alert>:null}
  {params.status==="product-created"?<Alert tone="success" title="Produk dibuat">Produk berhasil dibuat.</Alert>:null}
  {params.status==="stock-posted"?<Alert tone="success" title="Saldo awal dicatat">Saldo awal stok berhasil disimpan.</Alert>:null}
  {params.status==="stock-adjusted"?<Alert tone="success" title="Koreksi stok dicatat">Perubahan stok berhasil disimpan.</Alert>:null}
  {params.error?<Alert tone="danger" title="Stok belum dapat diproses">{params.error}</Alert>:null}

  <section className={styles.metrics}>
   <Card density="compact"><span>Produk</span><strong>{products.length}</strong><small>produk terdaftar</small></Card>
   <Card density="compact"><span>Total Stok</span><strong>{stockUnits}</strong><small>unit tersedia</small></Card>
   <Card density="compact" className={lowStocks?styles.attention:undefined}><span>Stok Menipis</span><strong>{lowStocks}</strong><small>0–5 unit</small></Card>
   <Card density="compact" className={negativeStocks?styles.metricAlert:undefined}><span>Nilai Stok</span><strong>{rupiah(stockValue)}</strong><small>{negativeStocks?`${negativeStocks} stok negatif perlu diperiksa`:"berdasarkan HPP"}</small></Card>
  </section>

  {warehouses.length===0?<Card className={styles.setupCard}><div><span className={styles.kicker}>Gudang</span><h3>Belum ada gudang.</h3><p>Buat Gudang Utama sebelum mencatat stok.</p></div>{canManage?<form action={createDefaultWarehouseAction}><button type="submit">Buat Gudang Utama</button></form>:null}</Card>:null}

  <section className={styles.mainGrid}>
   <Card className={styles.panel}><div className={styles.panelHeader}><div><span className={styles.kicker}>Produk</span><h3>Daftar Produk</h3></div><Badge>{products.length} item</Badge></div>
    {products.length===0?<div className={styles.empty}>Belum ada produk.</div>:<div className={styles.tableWrap}><table><thead><tr><th>SKU / Produk</th><th>Harga</th><th>Stok</th><th>Status</th></tr></thead><tbody>{products.map((product)=><tr key={product.id}><td><strong>{product.name}</strong><span>{product.sku}{product.barcode?` · ${product.barcode}`:""}</span></td><td><strong>{rupiah(product.sell_amount)}</strong><span>HPP {rupiah(product.cost_amount)}</span></td><td><strong className={product.stock_qty<0?styles.negativeStock:undefined}>{product.track_stock?product.stock_qty:"—"}</strong><span>{product.unit_name}</span></td><td><Badge tone={product.status==="ACTIVE"?"success":"neutral"}>{product.status==="ACTIVE"?"Aktif":"Tidak Aktif"}</Badge></td></tr>)}</tbody></table></div>}
   </Card>

   {canManage?<aside className={styles.sideStack}>
    <Card className={styles.panel}><span className={styles.kicker}>Produk</span><h3>Tambah Produk</h3><form action={createProductAction} className={styles.form}><label>SKU<input name="sku" required placeholder="BRG-001"/></label><label>Nama Produk<input name="name" required placeholder="Beras Premium 5 Kg"/></label><label>Barcode<input name="barcode" placeholder="Opsional"/></label><div className={styles.twoCols}><label>Satuan<input name="unitName" defaultValue="pcs" required/></label><label>HPP<input name="costAmount" inputMode="numeric" defaultValue="0" required/></label></div><label>Harga Jual<input name="sellAmount" inputMode="numeric" defaultValue="0" required/></label><div className={styles.checks}><label><input type="checkbox" name="trackStock" defaultChecked/> Lacak stok</label><label><input type="checkbox" name="trackExpiry"/> Lacak kedaluwarsa</label></div><button type="submit">Simpan Produk</button></form></Card>

    <Card className={styles.panel}><span className={styles.kicker}>Saldo Awal</span><h3>Catat Stok Awal</h3><p className={styles.formNote}>Gunakan hanya saat produk pertama kali dimasukkan ke sistem.</p><form action={postOpeningStockAction} className={styles.form}><label>Gudang<select name="warehouseId" required defaultValue=""><option value="" disabled>Pilih gudang</option>{warehouses.map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label>Produk<select name="productId" required defaultValue=""><option value="" disabled>Pilih produk</option>{stockProducts.map((product)=><option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><div className={styles.twoCols}><label>Jumlah<input name="quantity" type="number" min="1" step="1" required/></label><label>HPP / Unit<input name="unitCostAmount" inputMode="numeric" defaultValue="0" required/></label></div><label>Batch / Lot<input name="batchCode" placeholder="Opsional"/></label><label>Kedaluwarsa<input name="expiryDate" type="date"/></label><button type="submit" disabled={!warehouses.length||!stockProducts.length}>Simpan Stok Awal</button></form></Card>

    <SensitiveAction summary="Koreksi stok" impact={<><strong>Dampak tindakan</strong><span>Jumlah stok akan ditambah atau dikurangi berdasarkan hasil pemeriksaan fisik. Perubahan lama tetap tersimpan.</span></>} note="Gunakan hanya untuk koreksi stok yang dapat dijelaskan."><form action={postStockAdjustmentAction} className={styles.form}><label>Gudang<select name="warehouseId" required defaultValue=""><option value="" disabled>Pilih gudang</option>{warehouses.filter((warehouse)=>warehouse.status==="ACTIVE").map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label>Produk<select name="productId" required defaultValue=""><option value="" disabled>Pilih produk</option>{stockProducts.filter((product)=>product.status==="ACTIVE").map((product)=><option key={product.id} value={product.id}>{product.sku} · {product.name} · stok {product.stock_qty}</option>)}</select></label><div className={styles.twoCols}><label>Jenis Koreksi<select name="direction" defaultValue="OUT" required><option value="OUT">Stok Keluar / Berkurang</option><option value="IN">Stok Masuk / Bertambah</option></select></label><label>Jumlah<input name="quantity" type="number" min="1" step="1" required/></label></div><label>Alasan<textarea name="reason" minLength={8} maxLength={200} required placeholder="Contoh: koreksi hasil hitung fisik rak depan"/></label><div className={styles.twoCols}><label>Batch / Lot<input name="batchCode" placeholder="Opsional"/></label><label>Kedaluwarsa<input name="expiryDate" type="date"/></label></div><button type="submit" disabled={!warehouses.length||!stockProducts.length}>Simpan Koreksi</button></form></SensitiveAction>
   </aside>:null}
  </section>

  <Card className={`${styles.panel} ${styles.movementPanel}`}><div className={styles.panelHeader}><div><span className={styles.kicker}>Aktivitas Stok</span><h3>Pergerakan Stok Terbaru</h3></div><Badge>{movements.length}</Badge></div>
   {movements.length?<><div className={styles.desktopMovements}><div className={styles.tableWrap}><table className={styles.movementTable}><thead><tr><th>Waktu</th><th>Produk</th><th>Gudang</th><th>Jenis</th><th>Jumlah</th><th>HPP</th><th>Batch / Kedaluwarsa</th></tr></thead><tbody>{movements.map((movement)=><tr key={movement.id}><td><strong>{timestamp(movement.occurred_at)}</strong><span>{movement.reference_type||"—"}</span></td><td><strong>{movement.product_name}</strong><span>{movement.sku}</span></td><td><strong>{movement.warehouse_code}</strong><span>{movement.warehouse_name}</span></td><td><Badge tone={movement.quantity_delta>=0?"success":"warning"}>{movementLabel(movement.movement_type)}</Badge></td><td><strong className={movement.quantity_delta>=0?styles.qtyIn:styles.qtyOut}>{movement.quantity_delta>0?"+":""}{movement.quantity_delta}</strong></td><td><strong>{rupiah(movement.unit_cost_amount)}</strong></td><td><strong>{movement.batch_code||"—"}</strong><span>{movement.expiry_date||"Tanpa kedaluwarsa"}</span></td></tr>)}</tbody></table></div></div>
   <div className={styles.mobileMovements}>{movements.map(movement=><article className={styles.movementCard} key={`mobile-${movement.id}`}><span className={`${styles.movementIcon} ${movement.quantity_delta>=0?styles.movementIn:styles.movementOut}`}><MovementIcon type={movement.movement_type}/></span><div className={styles.movementCopy}><strong>{movementLabel(movement.movement_type)}</strong><span>{movement.product_name}</span><small>{timestamp(movement.occurred_at)} · {movement.warehouse_name}</small>{movement.reference_type?<small>{movement.reference_type}</small>:null}</div><strong className={`${styles.movementQty} ${movement.quantity_delta>=0?styles.qtyIn:styles.qtyOut}`}>{movement.quantity_delta>0?"+":""}{movement.quantity_delta}</strong></article>)}</div></>:<div className={styles.empty}>Belum ada aktivitas stok.</div>}
  </Card>
 </PageContainer>;
}
