import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import {
  listProductsWithStock,
  listRecentInventoryMovements,
  listWarehouses,
} from "@/lib/d1/inventory";
import {
  createDefaultWarehouseAction,
  createProductAction,
  postOpeningStockAction,
  postStockAdjustmentAction,
} from "./actions";
import styles from "./inventory.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ status?: string; error?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function timestamp(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    OPENING: "Opening",
    PURCHASE_RECEIPT: "Penerimaan",
    SALE: "Penjualan",
    SALE_VOID: "Void masuk",
    ADJUSTMENT_IN: "Adjustment +",
    ADJUSTMENT_OUT: "Adjustment −",
    TRANSFER_IN: "Transfer masuk",
    TRANSFER_OUT: "Transfer keluar",
  };
  return labels[type] ?? type;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("INVENTORY_VIEW")) redirect("/dashboard");

  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");

  const params = await searchParams;
  const [products, warehouses, movements] = await Promise.all([
    listProductsWithStock(access.organization.id),
    listWarehouses(access.organization.id),
    listRecentInventoryMovements(access.organization.id, 80),
  ]);

  const canManage = access.permissions.includes("ORG_MANAGE");
  const stockProducts = products.filter((product) => product.track_stock);
  const stockUnits = products.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0);
  const stockValue = products.reduce(
    (sum, item) => sum + Math.max(0, Number(item.stock_qty || 0)) * Number(item.cost_amount || 0),
    0,
  );
  const negativeStocks = stockProducts.filter((item) => item.stock_qty < 0).length;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p>OPERASIONAL · INVENTORY</p>
          <h1>Product & Inventory Control</h1>
        </div>
        <nav>
          <Link href="/pos">POS</Link>
          <Link href="/teller">Teller</Link>
          <Link href="/closing">Closing</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.kicker}>PHASE 1.4 · INVENTORY OPERATIONS</span>
            <h2>Stok berasal dari ledger dan setiap koreksi meninggalkan alasan.</h2>
            <p>
              Opening stock hanya untuk saldo awal. Setelah produk memiliki movement, koreksi dilakukan melalui Adjustment IN/OUT dengan alasan wajib dan audit event. Penjualan, void, dan adjustment semuanya masuk kartu stok yang sama.
            </p>
          </div>
          <div className={styles.orgCard}>
            <span>Organisasi</span>
            <strong>{access.organization.name}</strong>
            <small>{access.units.map((unit) => unit.name).join(", ") || "Tanpa unit scope"}</small>
          </div>
        </section>

        {params.status === "warehouse-ready" ? <div className={styles.success}>Gudang utama berhasil disiapkan.</div> : null}
        {params.status === "product-created" ? <div className={styles.success}>Produk berhasil dibuat.</div> : null}
        {params.status === "stock-posted" ? <div className={styles.success}>Opening stock berhasil diposting ke inventory ledger.</div> : null}
        {params.status === "stock-adjusted" ? <div className={styles.success}>Adjustment stok berhasil diposting dan audit trail dibuat.</div> : null}
        {params.error ? <div className={styles.error}>{params.error}</div> : null}

        <section className={styles.metrics}>
          <article><span>Produk</span><strong>{products.length}</strong><small>master produk</small></article>
          <article><span>Gudang</span><strong>{warehouses.length}</strong><small>lokasi aktif/nonaktif</small></article>
          <article><span>Total unit stok</span><strong>{stockUnits}</strong><small>dari movement ledger</small></article>
          <article className={negativeStocks ? styles.metricAlert : undefined}><span>Nilai stok</span><strong>{rupiah(stockValue)}</strong><small>{negativeStocks ? `${negativeStocks} saldo negatif perlu diperiksa` : "estimasi berdasarkan HPP"}</small></article>
        </section>

        {warehouses.length === 0 ? (
          <section className={styles.setupCard}>
            <div>
              <span className={styles.kicker}>STEP 01</span>
              <h3>Belum ada gudang.</h3>
              <p>Buat Gudang Utama terlebih dahulu sebelum posting opening stock.</p>
            </div>
            {canManage ? (
              <form action={createDefaultWarehouseAction}>
                <button type="submit">Buat Gudang Utama</button>
              </form>
            ) : null}
          </section>
        ) : null}

        <section className={styles.mainGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.kicker}>PRODUCT MASTER</span>
                <h3>Daftar Produk</h3>
              </div>
              <span className={styles.pill}>{products.length} item</span>
            </div>

            {products.length === 0 ? (
              <div className={styles.empty}>Belum ada produk. Tambahkan produk development pertama dari form di samping.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>SKU / Produk</th>
                      <th>Harga</th>
                      <th>Stok</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <strong>{product.name}</strong>
                          <span>{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</span>
                        </td>
                        <td>
                          <strong>{rupiah(product.sell_amount)}</strong>
                          <span>HPP {rupiah(product.cost_amount)}</span>
                        </td>
                        <td>
                          <strong className={product.stock_qty < 0 ? styles.negativeStock : undefined}>
                            {product.track_stock ? product.stock_qty : "—"}
                          </strong>
                          <span>{product.unit_name}</span>
                        </td>
                        <td><span className={styles.status}>{product.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {canManage ? (
            <aside className={styles.sideStack}>
              <section className={styles.panel}>
                <span className={styles.kicker}>MASTER</span>
                <h3>Tambah Produk</h3>
                <form action={createProductAction} className={styles.form}>
                  <label>SKU<input name="sku" required placeholder="BRG-001" /></label>
                  <label>Nama produk<input name="name" required placeholder="Beras Premium 5 Kg" /></label>
                  <label>Barcode<input name="barcode" placeholder="Opsional" /></label>
                  <div className={styles.twoCols}>
                    <label>Satuan<input name="unitName" defaultValue="pcs" required /></label>
                    <label>HPP<input name="costAmount" inputMode="numeric" defaultValue="0" required /></label>
                  </div>
                  <label>Harga jual<input name="sellAmount" inputMode="numeric" defaultValue="0" required /></label>
                  <div className={styles.checks}>
                    <label><input type="checkbox" name="trackStock" defaultChecked /> Lacak stok</label>
                    <label><input type="checkbox" name="trackExpiry" /> Lacak kedaluwarsa</label>
                  </div>
                  <button type="submit">Simpan Produk</button>
                </form>
              </section>

              <section className={styles.panel}>
                <span className={styles.kicker}>INITIAL BALANCE</span>
                <h3>Opening Stock</h3>
                <p className={styles.formNote}>Hanya untuk saldo awal produk di gudang. Setelah ada movement, gunakan Adjustment.</p>
                <form action={postOpeningStockAction} className={styles.form}>
                  <label>Gudang
                    <select name="warehouseId" required defaultValue="">
                      <option value="" disabled>Pilih gudang</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
                    </select>
                  </label>
                  <label>Produk
                    <select name="productId" required defaultValue="">
                      <option value="" disabled>Pilih produk</option>
                      {stockProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
                    </select>
                  </label>
                  <div className={styles.twoCols}>
                    <label>Qty<input name="quantity" type="number" min="1" step="1" required /></label>
                    <label>HPP/unit<input name="unitCostAmount" inputMode="numeric" defaultValue="0" required /></label>
                  </div>
                  <label>Batch/lot<input name="batchCode" placeholder="Opsional" /></label>
                  <label>Kedaluwarsa<input name="expiryDate" type="date" /></label>
                  <button type="submit" disabled={!warehouses.length || !stockProducts.length}>Posting Opening Stock</button>
                </form>
              </section>

              <section className={`${styles.panel} ${styles.adjustmentPanel}`}>
                <span className={styles.kicker}>CONTROLLED CORRECTION</span>
                <h3>Adjustment Stok</h3>
                <p className={styles.formNote}>Koreksi stok tidak mengubah saldo langsung. Sistem membuat movement baru dan menyimpan alasan ke audit trail.</p>
                <form action={postStockAdjustmentAction} className={styles.form}>
                  <label>Gudang
                    <select name="warehouseId" required defaultValue="">
                      <option value="" disabled>Pilih gudang</option>
                      {warehouses.filter((warehouse) => warehouse.status === "ACTIVE").map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
                    </select>
                  </label>
                  <label>Produk
                    <select name="productId" required defaultValue="">
                      <option value="" disabled>Pilih produk</option>
                      {stockProducts.filter((product) => product.status === "ACTIVE").map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name} · stok {product.stock_qty}</option>)}
                    </select>
                  </label>
                  <div className={styles.twoCols}>
                    <label>Arah
                      <select name="direction" defaultValue="OUT" required>
                        <option value="OUT">Keluar / minus</option>
                        <option value="IN">Masuk / plus</option>
                      </select>
                    </label>
                    <label>Qty<input name="quantity" type="number" min="1" step="1" required /></label>
                  </div>
                  <label>Alasan<textarea name="reason" minLength={8} maxLength={200} required placeholder="Contoh: koreksi hasil hitung fisik rak depan" /></label>
                  <div className={styles.twoCols}>
                    <label>Batch/lot<input name="batchCode" placeholder="Opsional" /></label>
                    <label>Kedaluwarsa<input name="expiryDate" type="date" /></label>
                  </div>
                  <button type="submit" disabled={!warehouses.length || !stockProducts.length}>Posting Adjustment</button>
                </form>
              </section>
            </aside>
          ) : null}
        </section>

        <section className={`${styles.panel} ${styles.movementPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>STOCK CARD · LEDGER</span>
              <h3>80 Movement Terakhir</h3>
            </div>
            <span className={styles.pill}>{movements.length} record</span>
          </div>

          {movements.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.movementTable}>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Produk</th>
                    <th>Gudang</th>
                    <th>Movement</th>
                    <th>Qty</th>
                    <th>HPP</th>
                    <th>Batch / Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td><strong>{timestamp(movement.occurred_at)}</strong><span>{movement.reference_type || "—"}</span></td>
                      <td><strong>{movement.product_name}</strong><span>{movement.sku}</span></td>
                      <td><strong>{movement.warehouse_code}</strong><span>{movement.warehouse_name}</span></td>
                      <td><span className={`${styles.movementBadge} ${movement.quantity_delta >= 0 ? styles.inBadge : styles.outBadge}`}>{movementLabel(movement.movement_type)}</span></td>
                      <td><strong className={movement.quantity_delta >= 0 ? styles.qtyIn : styles.qtyOut}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</strong></td>
                      <td><strong>{rupiah(movement.unit_cost_amount)}</strong></td>
                      <td><strong>{movement.batch_code || "—"}</strong><span>{movement.expiry_date || "Tanpa expiry"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.empty}>Belum ada inventory movement.</div>}
        </section>
      </div>
    </main>
  );
}
