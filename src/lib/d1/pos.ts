import { resolveAccountingMapping } from "./accounting-runtime";
import { getD1 } from "./context";

const POS_SCHEMA_VERSION = "transaction_core_v2_pos";

export type SaleProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit_name: string;
  cost_amount: number;
  sell_amount: number;
  track_stock: number;
  stock_qty: number;
};

export type RecentSaleRow = {
  id: string;
  receipt_number: string;
  total_amount: number;
  payment_status: string;
  sold_at: string;
  member_id: string | null;
};

type SaleItemInput = {
  productId: string;
  quantity: number;
};

type ProductForCommit = SaleProductRow;

function nowIso() {
  return new Date().toISOString();
}

function receiptNumber() {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `KDK-${time}-${random}`;
}

function journalNumber(receipt: string) {
  return `JRN-${receipt}`;
}

function normalizedItems(items: SaleItemInput[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const quantity = Number(item.quantity);
    if (!productId) throw new Error("Produk transaksi tidak valid.");
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 9999) throw new Error("Jumlah barang tidak valid.");
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  const result = Array.from(quantities.entries()).map(([productId, quantity]) => ({ productId, quantity }));
  if (!result.length) throw new Error("Keranjang masih kosong.");
  if (result.length > 30) throw new Error("Maksimal 30 jenis barang per transaksi development.");
  return result;
}

export async function ensurePosFoundation() {
  const db = getD1();
  const existing = await db.prepare("SELECT version FROM app_schema_versions WHERE version = ? LIMIT 1").bind(POS_SCHEMA_VERSION).first<{ version: string }>();
  if (existing?.version) return;
  const trigger = db.prepare(`
    CREATE TRIGGER IF NOT EXISTS inventory_prevent_negative_stock
    BEFORE INSERT ON inventory_movements
    WHEN NEW.quantity_delta < 0
      AND COALESCE((SELECT track_stock FROM products WHERE id = NEW.product_id), 0) = 1
      AND (COALESCE((SELECT SUM(quantity_delta) FROM inventory_movements WHERE organization_id = NEW.organization_id AND warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id), 0) + NEW.quantity_delta) < 0
    BEGIN
      SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK');
    END
  `);
  const marker = db.prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, ?)").bind(POS_SCHEMA_VERSION, nowIso());
  await db.batch([trigger, marker]);
}

export async function getPrimaryWarehouse(organizationId: string) {
  const db = getD1();
  return db.prepare("SELECT id, code, name FROM warehouses WHERE organization_id = ? AND status = 'ACTIVE' ORDER BY CASE WHEN code = 'MAIN' THEN 0 ELSE 1 END, created_at LIMIT 1").bind(organizationId).first<{ id: string; code: string; name: string }>();
}

export async function listSaleProducts(organizationId: string, warehouseId: string) {
  const db = getD1();
  const result = await db.prepare(`
    SELECT p.id,p.sku,p.barcode,p.name,p.unit_name,p.cost_amount,p.sell_amount,p.track_stock,
      COALESCE((SELECT SUM(im.quantity_delta) FROM inventory_movements im WHERE im.organization_id=p.organization_id AND im.product_id=p.id AND im.warehouse_id=?),0) AS stock_qty
    FROM products p WHERE p.organization_id=? AND p.status='ACTIVE' ORDER BY p.name
  `).bind(warehouseId, organizationId).all<SaleProductRow>();
  return result.results.map((row) => ({ ...row, cost_amount:Number(row.cost_amount), sell_amount:Number(row.sell_amount), track_stock:Number(row.track_stock), stock_qty:Number(row.stock_qty) }));
}

export async function listRecentSales(organizationId: string, tellerUserId: string, limit = 8) {
  const db = getD1();
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const result = await db.prepare(`SELECT id, receipt_number, total_amount, payment_status, sold_at, member_id FROM sales WHERE organization_id=? AND teller_user_id=? ORDER BY sold_at DESC LIMIT ${safeLimit}`).bind(organizationId, tellerUserId).all<RecentSaleRow>();
  return result.results.map((row) => ({ ...row, total_amount:Number(row.total_amount) }));
}

async function productsForCommit(organizationId: string, warehouseId: string, items: SaleItemInput[]) {
  const db = getD1();
  const placeholders = items.map(() => "?").join(",");
  const ids = items.map((item) => item.productId);
  const result = await db.prepare(`
    SELECT p.id,p.sku,p.barcode,p.name,p.unit_name,p.cost_amount,p.sell_amount,p.track_stock,
      COALESCE((SELECT SUM(im.quantity_delta) FROM inventory_movements im WHERE im.organization_id=p.organization_id AND im.product_id=p.id AND im.warehouse_id=?),0) AS stock_qty
    FROM products p WHERE p.organization_id=? AND p.status='ACTIVE' AND p.id IN (${placeholders})
  `).bind(warehouseId, organizationId, ...ids).all<ProductForCommit>();
  return result.results.map((row) => ({ ...row, cost_amount:Number(row.cost_amount), sell_amount:Number(row.sell_amount), track_stock:Number(row.track_stock), stock_qty:Number(row.stock_qty) }));
}

export async function commitCashSale(input: {
  organizationId: string;
  unitId?: string | null;
  tellerUserId: string;
  shiftId: string;
  warehouseId: string;
  memberId?: string | null;
  idempotencyKey: string;
  items: SaleItemInput[];
}) {
  await ensurePosFoundation();
  const db = getD1();
  const items = normalizedItems(input.items);
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey.length < 12 || idempotencyKey.length > 120) throw new Error("Idempotency key transaksi tidak valid.");

  const shift = await db.prepare("SELECT id FROM teller_shifts WHERE id=? AND organization_id=? AND teller_user_id=? AND status='OPEN' LIMIT 1").bind(input.shiftId,input.organizationId,input.tellerUserId).first<{id:string}>();
  if (!shift) throw new Error("Shift teller sudah tidak OPEN. Buka ulang workspace Teller.");
  const warehouse = await db.prepare("SELECT id FROM warehouses WHERE id=? AND organization_id=? AND status='ACTIVE' LIMIT 1").bind(input.warehouseId,input.organizationId).first<{id:string}>();
  if (!warehouse) throw new Error("Gudang transaksi tidak aktif.");

  const requestHash = JSON.stringify({ warehouseId:input.warehouseId, memberId:input.memberId||null, items:items.slice().sort((a,b)=>a.productId.localeCompare(b.productId)) });
  const existing = await db.prepare("SELECT request_hash, resource_id, status FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1").bind(input.organizationId,idempotencyKey).first<{request_hash:string|null;resource_id:string|null;status:string}>();
  if (existing) {
    if (existing.request_hash && existing.request_hash !== requestHash) throw new Error("Idempotency key sudah digunakan untuk transaksi yang berbeda.");
    if (existing.resource_id) {
      const priorSale = await db.prepare("SELECT id, receipt_number, total_amount FROM sales WHERE id=? AND organization_id=? LIMIT 1").bind(existing.resource_id,input.organizationId).first<{id:string;receipt_number:string;total_amount:number}>();
      if (priorSale) return { saleId:priorSale.id, receiptNumber:priorSale.receipt_number, totalAmount:Number(priorSale.total_amount), duplicate:true };
    }
    throw new Error("Transaksi dengan request yang sama masih belum dapat dipastikan hasilnya.");
  }

  const products = await productsForCommit(input.organizationId,input.warehouseId,items);
  const byId = new Map(products.map((product)=>[product.id,product]));
  if (products.length !== items.length) throw new Error("Ada produk yang sudah tidak aktif atau tidak ditemukan.");

  let subtotal=0;
  let totalCost=0;
  const calculated = items.map((item)=>{
    const product=byId.get(item.productId);
    if (!product) throw new Error("Produk transaksi tidak ditemukan.");
    if (product.track_stock && product.stock_qty < item.quantity) throw new Error(`Stok ${product.name} tidak cukup. Tersedia ${product.stock_qty}.`);
    const lineTotal=product.sell_amount*item.quantity;
    const lineCost=product.cost_amount*item.quantity;
    if (!Number.isSafeInteger(lineTotal)||!Number.isSafeInteger(lineCost)) throw new Error("Nilai transaksi melebihi batas aman.");
    subtotal+=lineTotal; totalCost+=lineCost;
    return {item,product,lineTotal,lineCost};
  });
  if (!Number.isSafeInteger(subtotal)||subtotal<=0) throw new Error("Total transaksi harus lebih dari nol.");

  const [revenueMapping,cogsMapping] = await Promise.all([
    resolveAccountingMapping(input.organizationId,"POS_CASH_REVENUE"),
    totalCost>0 ? resolveAccountingMapping(input.organizationId,"POS_COGS") : Promise.resolve(null),
  ]);
  if (totalCost>0 && !cogsMapping) throw new Error("Accounting mapping POS_COGS tidak tersedia.");

  const saleId=crypto.randomUUID();
  const paymentId=crypto.randomUUID();
  const journalId=crypto.randomUUID();
  const auditId=crypto.randomUUID();
  const receipt=receiptNumber();
  const journal=journalNumber(receipt);
  const now=nowIso();
  const statements=[];

  statements.push(db.prepare("INSERT INTO request_idempotency (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at) VALUES (?,?,'POS_CASH_SALE',?,?,'COMPLETED',?,NULL)").bind(input.organizationId,idempotencyKey,requestHash,saleId,now));
  statements.push(db.prepare("INSERT INTO sales (id,organization_id,unit_id,shift_id,receipt_number,member_id,teller_user_id,status,subtotal_amount,discount_amount,total_amount,payment_status,idempotency_key,sold_at,voided_at,voided_by,void_reason,created_at) VALUES (?,?,?,?,?,?,?,'COMMITTED',?,0,?,'PAID',?,?,NULL,NULL,NULL,?)").bind(saleId,input.organizationId,input.unitId||null,input.shiftId,receipt,input.memberId||null,input.tellerUserId,subtotal,subtotal,idempotencyKey,now,now));

  for (const line of calculated) {
    const saleLineId=crypto.randomUUID();
    statements.push(db.prepare("INSERT INTO sale_lines (id,sale_id,product_id,sku_snapshot,product_name_snapshot,quantity,unit_price_amount,unit_cost_amount,discount_amount,line_total_amount,created_at) VALUES (?,?,?,?,?,?,?,?,0,?,?)").bind(saleLineId,saleId,line.product.id,line.product.sku,line.product.name,line.item.quantity,line.product.sell_amount,line.product.cost_amount,line.lineTotal,now));
    if (line.product.track_stock) statements.push(db.prepare("INSERT INTO inventory_movements (id,organization_id,warehouse_id,product_id,movement_type,quantity_delta,unit_cost_amount,batch_code,expiry_date,reference_type,reference_id,actor_user_id,occurred_at,created_at) VALUES (?,?,?,?,'SALE',?,?,NULL,NULL,'SALE',?,?,?,?)").bind(crypto.randomUUID(),input.organizationId,input.warehouseId,line.product.id,-line.item.quantity,line.product.cost_amount,saleId,input.tellerUserId,now,now));
  }

  statements.push(db.prepare("INSERT INTO payments (id,organization_id,sale_id,shift_id,method,amount,status,provider_reference,external_reference,confirmed_at,created_at) VALUES (?,?,?,?,'CASH',?,'CONFIRMED',NULL,NULL,?,?)").bind(paymentId,input.organizationId,saleId,input.shiftId,subtotal,now,now));
  statements.push(db.prepare("INSERT INTO journal_entries (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at) VALUES (?,?,?,'SALE',?,?,'POSTED',?,?,?)").bind(journalId,input.organizationId,journal,saleId,`Penjualan tunai ${receipt}`,input.tellerUserId,now,now));
  statements.push(db.prepare("INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?, ?,0,'Kas dari penjualan',?)").bind(crypto.randomUUID(),journalId,revenueMapping.debit_code,subtotal,now));
  statements.push(db.prepare("INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,0,?,'Pendapatan penjualan',?)").bind(crypto.randomUUID(),journalId,revenueMapping.credit_code,subtotal,now));
  if (totalCost>0 && cogsMapping) {
    statements.push(db.prepare("INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?, ?,0,'HPP penjualan',?)").bind(crypto.randomUUID(),journalId,cogsMapping.debit_code,totalCost,now));
    statements.push(db.prepare("INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,0,?,'Pengurangan persediaan',?)").bind(crypto.randomUUID(),journalId,cogsMapping.credit_code,totalCost,now));
  }

  statements.push(db.prepare("INSERT INTO transaction_audit_events (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,'SALE_COMMITTED','SALE',?,?,?)").bind(auditId,input.organizationId,input.tellerUserId,saleId,JSON.stringify({receiptNumber:receipt,totalAmount:subtotal,totalCost,paymentMethod:"CASH",shiftId:input.shiftId,warehouseId:input.warehouseId,memberId:input.memberId||null,accounting:{revenue:revenueMapping,cogs:cogsMapping},lines:calculated.map((line)=>({productId:line.product.id,sku:line.product.sku,quantity:line.item.quantity,unitPriceAmount:line.product.sell_amount}))}),now));

  try { await db.batch(statements); }
  catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(message.includes("INSUFFICIENT_STOCK")) throw new Error("Stok berubah saat transaksi diproses. Muat ulang POS dan periksa stok terbaru.");
    if(message.includes("request_idempotency")||message.includes("UNIQUE constraint")) throw new Error("Transaksi duplikat dicegah. Muat ulang untuk melihat hasil transaksi terakhir.");
    throw error;
  }
  return {saleId,receiptNumber:receipt,totalAmount:subtotal,duplicate:false};
}
