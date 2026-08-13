import { getD1 } from "./context";

export type ProductStockRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit_name: string;
  cost_amount: number;
  sell_amount: number;
  track_stock: number;
  track_expiry: number;
  status: string;
  stock_qty: number;
};

export type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  status: string;
};

function nowIso() {
  return new Date().toISOString();
}

export async function ensureDefaultWarehouse(input: {
  organizationId: string;
  unitId?: string | null;
}) {
  const db = getD1();
  const existing = await db
    .prepare(
      "SELECT id, code, name, status FROM warehouses WHERE organization_id = ? AND status = 'ACTIVE' ORDER BY created_at LIMIT 1",
    )
    .bind(input.organizationId)
    .first<WarehouseRow>();

  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO warehouses (id, organization_id, unit_id, code, name, status, created_at, updated_at) VALUES (?, ?, ?, 'MAIN', 'Gudang Utama', 'ACTIVE', ?, ?)",
    )
    .bind(id, input.organizationId, input.unitId ?? null, now, now)
    .run();

  return { id, code: "MAIN", name: "Gudang Utama", status: "ACTIVE" } satisfies WarehouseRow;
}

export async function listWarehouses(organizationId: string) {
  const db = getD1();
  const result = await db
    .prepare(
      "SELECT id, code, name, status FROM warehouses WHERE organization_id = ? ORDER BY name",
    )
    .bind(organizationId)
    .all<WarehouseRow>();
  return result.results;
}

export async function listProductsWithStock(organizationId: string) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT
        p.id,
        p.sku,
        p.barcode,
        p.name,
        p.unit_name,
        p.cost_amount,
        p.sell_amount,
        p.track_stock,
        p.track_expiry,
        p.status,
        COALESCE(SUM(im.quantity_delta), 0) AS stock_qty
      FROM products p
      LEFT JOIN inventory_movements im
        ON im.product_id = p.id
       AND im.organization_id = p.organization_id
      WHERE p.organization_id = ?
      GROUP BY p.id
      ORDER BY p.name
    `)
    .bind(organizationId)
    .all<ProductStockRow>();

  return result.results.map((row) => ({
    ...row,
    cost_amount: Number(row.cost_amount),
    sell_amount: Number(row.sell_amount),
    track_stock: Number(row.track_stock),
    track_expiry: Number(row.track_expiry),
    stock_qty: Number(row.stock_qty),
  }));
}

export async function createProduct(input: {
  organizationId: string;
  actorUserId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  unitName: string;
  costAmount: number;
  sellAmount: number;
  trackStock: boolean;
  trackExpiry: boolean;
}) {
  const db = getD1();
  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = nowIso();

  const productInsert = db
    .prepare(
      "INSERT INTO products (id, organization_id, sku, barcode, name, unit_name, cost_amount, sell_amount, track_stock, track_expiry, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)",
    )
    .bind(
      id,
      input.organizationId,
      input.sku,
      input.barcode || null,
      input.name,
      input.unitName,
      input.costAmount,
      input.sellAmount,
      input.trackStock ? 1 : 0,
      input.trackExpiry ? 1 : 0,
      now,
      now,
    );

  const auditInsert = db
    .prepare(
      "INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'PRODUCT_CREATED', 'PRODUCT', ?, ?, ?)",
    )
    .bind(
      auditId,
      input.organizationId,
      input.actorUserId,
      id,
      JSON.stringify({ sku: input.sku, name: input.name }),
      now,
    );

  await db.batch([productInsert, auditInsert]);
  return id;
}

export async function postOpeningStock(input: {
  organizationId: string;
  actorUserId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  unitCostAmount: number;
  batchCode?: string | null;
  expiryDate?: string | null;
}) {
  const db = getD1();
  const product = await db
    .prepare(
      "SELECT id, track_stock, track_expiry FROM products WHERE id = ? AND organization_id = ? AND status = 'ACTIVE' LIMIT 1",
    )
    .bind(input.productId, input.organizationId)
    .first<{ id: string; track_stock: number; track_expiry: number }>();

  if (!product) throw new Error("Produk tidak ditemukan atau tidak aktif.");
  if (!Number(product.track_stock)) throw new Error("Produk ini tidak memakai pelacakan stok.");

  const warehouse = await db
    .prepare(
      "SELECT id FROM warehouses WHERE id = ? AND organization_id = ? AND status = 'ACTIVE' LIMIT 1",
    )
    .bind(input.warehouseId, input.organizationId)
    .first<{ id: string }>();
  if (!warehouse) throw new Error("Gudang tidak ditemukan atau tidak aktif.");

  const movementId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = nowIso();
  const expiry = Number(product.track_expiry) ? input.expiryDate || null : null;

  const movement = db
    .prepare(
      "INSERT INTO inventory_movements (id, organization_id, warehouse_id, product_id, movement_type, quantity_delta, unit_cost_amount, batch_code, expiry_date, reference_type, reference_id, actor_user_id, occurred_at, created_at) VALUES (?, ?, ?, ?, 'OPENING', ?, ?, ?, ?, 'OPENING_STOCK', ?, ?, ?, ?)",
    )
    .bind(
      movementId,
      input.organizationId,
      input.warehouseId,
      input.productId,
      input.quantity,
      input.unitCostAmount,
      input.batchCode || null,
      expiry,
      movementId,
      input.actorUserId,
      now,
      now,
    );

  const audit = db
    .prepare(
      "INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'OPENING_STOCK_POSTED', 'INVENTORY_MOVEMENT', ?, ?, ?)",
    )
    .bind(
      auditId,
      input.organizationId,
      input.actorUserId,
      movementId,
      JSON.stringify({
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        unitCostAmount: input.unitCostAmount,
      }),
      now,
    );

  await db.batch([movement, audit]);
  return movementId;
}
