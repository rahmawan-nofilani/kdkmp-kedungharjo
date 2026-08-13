import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listProductsWithStock, listWarehouses } from "@/lib/d1/inventory";
import {
  createDefaultWarehouseAction,
  createProductAction,
  postOpeningStockAction,
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

export default async function InventoryPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("INVENTORY_VIEW")) redirect("/dashboard");

  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");

  const params = await searchParams;
  const [products, warehouses] = await Promise.all([
    listProductsWithStock(access.organization.id),
    listWarehouses(access.organization.id),
  ]);

  const canManage = access.permissions.includes("ORG_MANAGE");
  const stockUnits = products.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0);
  const stockValue = products.reduce(
    (sum, item) => sum + Math.max(0, Number(item.stock_qty || 0)) * Number(item.cost_amount || 0),
    0,
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p>OPERASIONAL · INVENTORY</p>
          <h1>Product & Inventory Master</h1>
        </div>
        <nav>
          <Link href="/teller">Teller</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.kicker}>D1 TRANSACTION CORE · READY</span>
            <h2>Bangun stok dari ledger, bukan angka yang bisa diedit langsung.</h2>
            <p>
              Produk, gudang, dan opening stock sekarang disimpan di Cloudflare D1. Setiap perubahan stok masuk sebagai inventory movement dan audit event.
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
        {params.error ? <div className={styles.error}>{params.error}</div> : null}

        <section className={styles.metrics}>
          <article><span>Produk</span><strong>{products.length}</strong><small>master aktif + nonaktif</small></article>
          <article><span>Gudang</span><strong>{warehouses.length}</strong><small>lokasi inventory</small></article>
          <article><span>Total unit stok</span><strong>{stockUnits}</strong><small>hasil penjumlahan movement</small></article>
          <article><span>Nilai stok</span><strong>{rupiah(stockValue)}</strong><small>estimasi berdasarkan cost</small></article>
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
                          <strong>{product.track_stock ? product.stock_qty : "—"}</strong>
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
                <span className={styles.kicker}>STEP 02</span>
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
                <span className={styles.kicker}>STEP 03</span>
                <h3>Opening Stock</h3>
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
                      {products.filter((product) => product.track_stock).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
                    </select>
                  </label>
                  <div className={styles.twoCols}>
                    <label>Qty<input name="quantity" type="number" min="1" step="1" required /></label>
                    <label>HPP/unit<input name="unitCostAmount" inputMode="numeric" defaultValue="0" required /></label>
                  </div>
                  <label>Batch/lot<input name="batchCode" placeholder="Opsional" /></label>
                  <label>Kedaluwarsa<input name="expiryDate" type="date" /></label>
                  <button type="submit" disabled={!warehouses.length || !products.length}>Posting Opening Stock</button>
                </form>
              </section>
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}
