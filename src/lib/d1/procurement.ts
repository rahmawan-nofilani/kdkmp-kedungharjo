import { getD1, type D1PreparedLike } from "./context";

export type SupplierRow = {
  id: string;
  code: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms_days: number;
  status: string;
};

export type PurchaseRequestRow = {
  id: string;
  pr_number: string;
  status: string;
  preferred_supplier_id: string | null;
  supplier_name: string | null;
  notes: string | null;
  total_estimated_amount: number;
  requested_by: string;
  approved_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  item_count: number;
};

export type PurchaseRequestItemRow = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit_name: string;
  quantity: number;
  estimated_unit_cost_amount: number;
  line_total_amount: number;
};

export type PurchaseOrderRow = {
  id: string;
  po_number: string;
  status: string;
  purchase_request_id: string;
  pr_number: string;
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  total_amount: number;
  expected_date: string | null;
  notes: string | null;
  created_by: string;
  issued_by: string | null;
  created_at: string;
  issued_at: string | null;
  item_count: number;
  quantity_ordered: number;
  quantity_received: number;
};

export type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit_name: string;
  track_expiry: number;
  quantity_ordered: number;
  quantity_received: number;
  remaining_qty: number;
  unit_cost_amount: number;
  line_total_amount: number;
};

export type GoodsReceiptRow = {
  id: string;
  receipt_number: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  status: string;
  notes: string | null;
  received_by: string;
  received_at: string;
  total_qty: number;
  line_count: number;
};

function nowIso() {
  return new Date().toISOString();
}

function documentNumber(prefix: string) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `${prefix}-${y}${m}${d}-${hh}${mm}-${suffix}`;
}

export async function listSuppliers(organizationId: string) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT id, code, name, tax_id, contact_name, phone, email, address,
             payment_terms_days, status
      FROM suppliers
      WHERE organization_id = ?
      ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, name
    `)
    .bind(organizationId)
    .all<SupplierRow>();
  return result.results.map((row) => ({ ...row, payment_terms_days: Number(row.payment_terms_days) }));
}

export async function createSupplier(input: {
  organizationId: string;
  actorUserId: string;
  code: string;
  name: string;
  taxId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTermsDays: number;
}) {
  const db = getD1();
  const id = crypto.randomUUID();
  const now = nowIso();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || code.length > 30) throw new Error("Kode supplier wajib dan maksimal 30 karakter.");
  if (name.length < 2 || name.length > 120) throw new Error("Nama supplier tidak valid.");
  if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 || input.paymentTermsDays > 365) {
    throw new Error("Termin pembayaran harus 0–365 hari.");
  }

  const supplier = db
    .prepare(`
      INSERT INTO suppliers (
        id, organization_id, code, name, tax_id, contact_name, phone, email, address,
        payment_terms_days, status, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
    `)
    .bind(
      id, input.organizationId, code, name, input.taxId?.trim() || null,
      input.contactName?.trim() || null, input.phone?.trim() || null,
      input.email?.trim() || null, input.address?.trim() || null,
      input.paymentTermsDays, input.actorUserId, input.actorUserId, now, now,
    );

  const audit = db
    .prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'SUPPLIER_CREATED', 'SUPPLIER', ?, ?, ?)
    `)
    .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, id, JSON.stringify({ code, name }), now);

  await db.batch([supplier, audit]);
  return id;
}

export async function listPurchaseRequests(organizationId: string, limit = 100) {
  const db = getD1();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const result = await db
    .prepare(`
      SELECT pr.id, pr.pr_number, pr.status, pr.preferred_supplier_id,
             s.name AS supplier_name, pr.notes, pr.total_estimated_amount,
             pr.requested_by, pr.approved_by, pr.rejection_reason,
             pr.created_at, pr.submitted_at, pr.approved_at,
             COUNT(pri.id) AS item_count
      FROM purchase_requests pr
      LEFT JOIN suppliers s ON s.id = pr.preferred_supplier_id
      LEFT JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
      WHERE pr.organization_id = ?
      GROUP BY pr.id
      ORDER BY pr.created_at DESC
      LIMIT ${safeLimit}
    `)
    .bind(organizationId)
    .all<PurchaseRequestRow>();
  return result.results.map((row) => ({
    ...row,
    total_estimated_amount: Number(row.total_estimated_amount),
    item_count: Number(row.item_count),
  }));
}

export async function getPurchaseRequestItems(purchaseRequestId: string) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT pri.id, pri.product_id, p.sku, p.name AS product_name, p.unit_name,
             pri.quantity, pri.estimated_unit_cost_amount, pri.line_total_amount
      FROM purchase_request_items pri
      JOIN products p ON p.id = pri.product_id
      WHERE pri.purchase_request_id = ?
      ORDER BY p.name
    `)
    .bind(purchaseRequestId)
    .all<PurchaseRequestItemRow>();
  return result.results.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    estimated_unit_cost_amount: Number(row.estimated_unit_cost_amount),
    line_total_amount: Number(row.line_total_amount),
  }));
}

export async function createPurchaseRequest(input: {
  organizationId: string;
  unitId?: string | null;
  actorUserId: string;
  preferredSupplierId?: string | null;
  notes?: string | null;
  items: Array<{ productId: string; quantity: number; estimatedUnitCostAmount: number }>;
}) {
  const db = getD1();
  if (!input.items.length || input.items.length > 50) throw new Error("PR harus memiliki 1–50 item.");

  const merged = new Map<string, { productId: string; quantity: number; estimatedUnitCostAmount: number }>();
  for (const raw of input.items) {
    if (!raw.productId || !Number.isInteger(raw.quantity) || raw.quantity <= 0) throw new Error("Qty PR harus bilangan bulat positif.");
    if (!Number.isInteger(raw.estimatedUnitCostAmount) || raw.estimatedUnitCostAmount < 0) throw new Error("Estimasi HPP tidak valid.");
    const existing = merged.get(raw.productId);
    if (existing) existing.quantity += raw.quantity;
    else merged.set(raw.productId, { ...raw });
  }
  const items = [...merged.values()];

  if (input.preferredSupplierId) {
    const supplier = await db
      .prepare("SELECT id FROM suppliers WHERE id = ? AND organization_id = ? AND status = 'ACTIVE' LIMIT 1")
      .bind(input.preferredSupplierId, input.organizationId)
      .first<{ id: string }>();
    if (!supplier) throw new Error("Supplier pilihan tidak aktif atau tidak ditemukan.");
  }

  const productIds = items.map((item) => item.productId);
  for (const productId of productIds) {
    const product = await db
      .prepare("SELECT id FROM products WHERE id = ? AND organization_id = ? AND status = 'ACTIVE' LIMIT 1")
      .bind(productId, input.organizationId)
      .first<{ id: string }>();
    if (!product) throw new Error("Salah satu produk PR tidak aktif atau tidak ditemukan.");
  }

  const id = crypto.randomUUID();
  const number = documentNumber("PR");
  const now = nowIso();
  const total = items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCostAmount, 0);
  const statements: D1PreparedLike[] = [];

  statements.push(
    db.prepare(`
      INSERT INTO purchase_requests (
        id, organization_id, unit_id, pr_number, preferred_supplier_id, status, notes,
        total_estimated_amount, requested_by, created_at, updated_at, submitted_at
      ) VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?, ?, ?, ?)
    `).bind(
      id, input.organizationId, input.unitId ?? null, number, input.preferredSupplierId ?? null,
      input.notes?.trim() || null, total, input.actorUserId, now, now, now,
    ),
  );

  for (const item of items) {
    statements.push(
      db.prepare(`
        INSERT INTO purchase_request_items (
          id, purchase_request_id, product_id, quantity, estimated_unit_cost_amount,
          line_total_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), id, item.productId, item.quantity, item.estimatedUnitCostAmount,
        item.quantity * item.estimatedUnitCostAmount, now,
      ),
    );
  }

  statements.push(
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'PURCHASE_REQUEST_SUBMITTED', 'PURCHASE_REQUEST', ?, ?, ?)
    `).bind(
      crypto.randomUUID(), input.organizationId, input.actorUserId, id,
      JSON.stringify({ prNumber: number, itemCount: items.length, totalEstimatedAmount: total }), now,
    ),
  );

  await db.batch(statements);
  return id;
}

export async function decidePurchaseRequest(input: {
  organizationId: string;
  actorUserId: string;
  purchaseRequestId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string | null;
}) {
  const db = getD1();
  const pr = await db
    .prepare("SELECT id, pr_number, status, requested_by FROM purchase_requests WHERE id = ? AND organization_id = ? LIMIT 1")
    .bind(input.purchaseRequestId, input.organizationId)
    .first<{ id: string; pr_number: string; status: string; requested_by: string }>();
  if (!pr) throw new Error("Purchase Request tidak ditemukan.");
  if (pr.status !== "SUBMITTED") throw new Error("Hanya PR SUBMITTED yang dapat diputuskan.");
  if (pr.requested_by === input.actorUserId) throw new Error("Maker-checker: pembuat PR tidak boleh menyetujui PR sendiri.");

  const now = nowIso();
  if (input.decision === "REJECT") {
    const reason = input.reason?.trim() || "";
    if (reason.length < 8) throw new Error("Alasan penolakan minimal 8 karakter.");
    await db.batch([
      db.prepare(`
        UPDATE purchase_requests
        SET status='REJECTED', rejected_by=?, rejection_reason=?, rejected_at=?, updated_at=?
        WHERE id=? AND organization_id=? AND status='SUBMITTED'
      `).bind(input.actorUserId, reason, now, now, pr.id, input.organizationId),
      db.prepare(`
        INSERT INTO transaction_audit_events
          (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
        VALUES (?, ?, ?, 'PURCHASE_REQUEST_REJECTED', 'PURCHASE_REQUEST', ?, ?, ?)
      `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, pr.id, JSON.stringify({ reason }), now),
    ]);
    return "REJECTED" as const;
  }

  await db.batch([
    db.prepare(`
      UPDATE purchase_requests
      SET status='APPROVED', approved_by=?, approved_at=?, updated_at=?
      WHERE id=? AND organization_id=? AND status='SUBMITTED'
    `).bind(input.actorUserId, now, now, pr.id, input.organizationId),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'PURCHASE_REQUEST_APPROVED', 'PURCHASE_REQUEST', ?, '{}', ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, pr.id, now),
  ]);
  return "APPROVED" as const;
}

export async function createPurchaseOrderFromRequest(input: {
  organizationId: string;
  actorUserId: string;
  purchaseRequestId: string;
  supplierId: string;
  expectedDate?: string | null;
  notes?: string | null;
}) {
  const db = getD1();
  const pr = await db
    .prepare("SELECT id, status FROM purchase_requests WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.purchaseRequestId, input.organizationId)
    .first<{ id: string; status: string }>();
  if (!pr || pr.status !== "APPROVED") throw new Error("PO hanya dapat dibuat dari PR APPROVED.");

  const supplier = await db
    .prepare("SELECT id FROM suppliers WHERE id=? AND organization_id=? AND status='ACTIVE' LIMIT 1")
    .bind(input.supplierId, input.organizationId)
    .first<{ id: string }>();
  if (!supplier) throw new Error("Supplier PO tidak aktif atau tidak ditemukan.");

  const items = await getPurchaseRequestItems(pr.id);
  if (!items.length) throw new Error("PR tidak memiliki item.");
  const total = items.reduce((sum, item) => sum + item.line_total_amount, 0);
  const id = crypto.randomUUID();
  const number = documentNumber("PO");
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO purchase_orders (
        id, organization_id, purchase_request_id, supplier_id, po_number, status,
        total_amount, expected_date, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)
    `).bind(
      id, input.organizationId, pr.id, input.supplierId, number, total,
      input.expectedDate || null, input.notes?.trim() || null, input.actorUserId, now, now,
    ),
  ];

  for (const item of items) {
    statements.push(
      db.prepare(`
        INSERT INTO purchase_order_items (
          id, purchase_order_id, product_id, quantity_ordered, unit_cost_amount,
          line_total_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), id, item.product_id, item.quantity,
        item.estimated_unit_cost_amount, item.line_total_amount, now,
      ),
    );
  }

  statements.push(
    db.prepare("UPDATE purchase_requests SET status='PO_CREATED', updated_at=? WHERE id=? AND status='APPROVED'")
      .bind(now, pr.id),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'PURCHASE_ORDER_CREATED', 'PURCHASE_ORDER', ?, ?, ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, id, JSON.stringify({ poNumber: number, purchaseRequestId: pr.id, totalAmount: total }), now),
  );

  await db.batch(statements);
  return id;
}

export async function issuePurchaseOrder(input: {
  organizationId: string;
  actorUserId: string;
  purchaseOrderId: string;
}) {
  const db = getD1();
  const po = await db
    .prepare("SELECT id, status FROM purchase_orders WHERE id=? AND organization_id=? LIMIT 1")
    .bind(input.purchaseOrderId, input.organizationId)
    .first<{ id: string; status: string }>();
  if (!po || po.status !== "DRAFT") throw new Error("Hanya PO DRAFT yang dapat diterbitkan.");
  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE purchase_orders SET status='ISSUED', issued_by=?, issued_at=?, updated_at=? WHERE id=? AND status='DRAFT'")
      .bind(input.actorUserId, now, now, po.id),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'PURCHASE_ORDER_ISSUED', 'PURCHASE_ORDER', ?, '{}', ?)
    `).bind(crypto.randomUUID(), input.organizationId, input.actorUserId, po.id, now),
  ]);
}

export async function listPurchaseOrders(organizationId: string, limit = 100) {
  const db = getD1();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const result = await db
    .prepare(`
      SELECT po.id, po.po_number, po.status, po.purchase_request_id, pr.pr_number,
             po.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
             po.total_amount, po.expected_date, po.notes, po.created_by, po.issued_by,
             po.created_at, po.issued_at,
             COUNT(DISTINCT poi.id) AS item_count,
             COALESCE(SUM(poi.quantity_ordered),0) AS quantity_ordered,
             COALESCE((
               SELECT SUM(gri.quantity_received)
               FROM goods_receipt_items gri
               JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
               JOIN purchase_order_items x ON x.id = gri.purchase_order_item_id
               WHERE x.purchase_order_id = po.id AND gr.status='POSTED'
             ),0) AS quantity_received
      FROM purchase_orders po
      JOIN purchase_requests pr ON pr.id = po.purchase_request_id
      JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.organization_id = ?
      GROUP BY po.id
      ORDER BY po.created_at DESC
      LIMIT ${safeLimit}
    `)
    .bind(organizationId)
    .all<PurchaseOrderRow>();
  return result.results.map((row) => ({
    ...row,
    total_amount: Number(row.total_amount),
    item_count: Number(row.item_count),
    quantity_ordered: Number(row.quantity_ordered),
    quantity_received: Number(row.quantity_received),
  }));
}

export async function getPurchaseOrderDetail(organizationId: string, purchaseOrderId: string) {
  const db = getD1();
  const po = await db
    .prepare(`
      SELECT po.id, po.po_number, po.status, po.purchase_request_id, pr.pr_number,
             po.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
             po.total_amount, po.expected_date, po.notes, po.created_by, po.issued_by,
             po.created_at, po.issued_at,
             0 AS item_count, 0 AS quantity_ordered, 0 AS quantity_received
      FROM purchase_orders po
      JOIN purchase_requests pr ON pr.id=po.purchase_request_id
      JOIN suppliers s ON s.id=po.supplier_id
      WHERE po.id=? AND po.organization_id=? LIMIT 1
    `)
    .bind(purchaseOrderId, organizationId)
    .first<PurchaseOrderRow>();
  if (!po) return null;

  const itemsResult = await db
    .prepare(`
      SELECT poi.id, poi.product_id, p.sku, p.name AS product_name, p.unit_name,
             p.track_expiry, poi.quantity_ordered, poi.unit_cost_amount, poi.line_total_amount,
             COALESCE((
               SELECT SUM(gri.quantity_received)
               FROM goods_receipt_items gri
               JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
               WHERE gri.purchase_order_item_id=poi.id AND gr.status='POSTED'
             ),0) AS quantity_received
      FROM purchase_order_items poi
      JOIN products p ON p.id=poi.product_id
      WHERE poi.purchase_order_id=?
      ORDER BY p.name
    `)
    .bind(po.id)
    .all<Omit<PurchaseOrderItemRow, "remaining_qty">>();

  const items: PurchaseOrderItemRow[] = itemsResult.results.map((row) => {
    const ordered = Number(row.quantity_ordered);
    const received = Number(row.quantity_received);
    return {
      ...row,
      track_expiry: Number(row.track_expiry),
      quantity_ordered: ordered,
      quantity_received: received,
      remaining_qty: Math.max(0, ordered - received),
      unit_cost_amount: Number(row.unit_cost_amount),
      line_total_amount: Number(row.line_total_amount),
    };
  });

  const receipts = await listGoodsReceipts(po.id);
  return {
    po: { ...po, total_amount: Number(po.total_amount) },
    items,
    receipts,
  };
}

export async function listGoodsReceipts(purchaseOrderId: string) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT gr.id, gr.receipt_number, gr.warehouse_id, w.code AS warehouse_code,
             w.name AS warehouse_name, gr.status, gr.notes, gr.received_by, gr.received_at,
             COALESCE(SUM(gri.quantity_received),0) AS total_qty,
             COUNT(gri.id) AS line_count
      FROM goods_receipts gr
      JOIN warehouses w ON w.id=gr.warehouse_id
      LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id=gr.id
      WHERE gr.purchase_order_id=?
      GROUP BY gr.id
      ORDER BY gr.received_at DESC
    `)
    .bind(purchaseOrderId)
    .all<GoodsReceiptRow>();
  return result.results.map((row) => ({ ...row, total_qty: Number(row.total_qty), line_count: Number(row.line_count) }));
}

export async function postGoodsReceipt(input: {
  organizationId: string;
  actorUserId: string;
  purchaseOrderId: string;
  warehouseId: string;
  notes?: string | null;
  lines: Array<{ purchaseOrderItemId: string; quantityReceived: number; batchCode?: string | null; expiryDate?: string | null }>;
}) {
  const db = getD1();
  const detail = await getPurchaseOrderDetail(input.organizationId, input.purchaseOrderId);
  if (!detail) throw new Error("Purchase Order tidak ditemukan.");
  if (!['ISSUED','PARTIALLY_RECEIVED'].includes(detail.po.status)) throw new Error("PO belum diterbitkan atau sudah selesai diterima.");

  const warehouse = await db
    .prepare("SELECT id FROM warehouses WHERE id=? AND organization_id=? AND status='ACTIVE' LIMIT 1")
    .bind(input.warehouseId, input.organizationId)
    .first<{ id: string }>();
  if (!warehouse) throw new Error("Gudang penerimaan tidak aktif atau tidak ditemukan.");

  const byId = new Map(detail.items.map((item) => [item.id, item]));
  const lines = input.lines.filter((line) => Number.isInteger(line.quantityReceived) && line.quantityReceived > 0);
  if (!lines.length) throw new Error("Isi minimal satu qty penerimaan.");

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.purchaseOrderItemId)) throw new Error("Item penerimaan duplikat.");
    seen.add(line.purchaseOrderItemId);
    const item = byId.get(line.purchaseOrderItemId);
    if (!item) throw new Error("Item PO tidak ditemukan.");
    if (line.quantityReceived > item.remaining_qty) throw new Error(`Qty ${item.product_name} melebihi sisa PO (${item.remaining_qty}).`);
    if (item.track_expiry && (!line.expiryDate || !line.batchCode?.trim())) {
      throw new Error(`Batch dan expiry wajib untuk ${item.product_name}.`);
    }
  }

  const receiptId = crypto.randomUUID();
  const receiptNumber = documentNumber("GR");
  const now = nowIso();
  const statements: D1PreparedLike[] = [
    db.prepare(`
      INSERT INTO goods_receipts (
        id, organization_id, purchase_order_id, warehouse_id, receipt_number, status,
        notes, received_by, received_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'POSTED', ?, ?, ?, ?)
    `).bind(
      receiptId, input.organizationId, detail.po.id, input.warehouseId, receiptNumber,
      input.notes?.trim() || null, input.actorUserId, now, now,
    ),
  ];

  for (const line of lines) {
    const item = byId.get(line.purchaseOrderItemId)!;
    statements.push(
      db.prepare(`
        INSERT INTO goods_receipt_items (
          id, goods_receipt_id, purchase_order_item_id, product_id, quantity_received,
          unit_cost_amount, batch_code, expiry_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), receiptId, item.id, item.product_id, line.quantityReceived,
        item.unit_cost_amount, line.batchCode?.trim() || null, line.expiryDate || null, now,
      ),
      db.prepare(`
        INSERT INTO inventory_movements (
          id, organization_id, warehouse_id, product_id, movement_type, quantity_delta,
          unit_cost_amount, batch_code, expiry_date, reference_type, reference_id,
          actor_user_id, occurred_at, created_at
        ) VALUES (?, ?, ?, ?, 'PURCHASE_RECEIPT', ?, ?, ?, ?, 'GOODS_RECEIPT', ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), input.organizationId, input.warehouseId, item.product_id,
        line.quantityReceived, item.unit_cost_amount, line.batchCode?.trim() || null,
        line.expiryDate || null, receiptId, input.actorUserId, now, now,
      ),
    );
  }

  const newReceivedByItem = new Map(detail.items.map((item) => [item.id, item.quantity_received]));
  for (const line of lines) newReceivedByItem.set(line.purchaseOrderItemId, (newReceivedByItem.get(line.purchaseOrderItemId) || 0) + line.quantityReceived);
  const allReceived = detail.items.every((item) => (newReceivedByItem.get(item.id) || 0) >= item.quantity_ordered);
  const nextStatus = allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";

  statements.push(
    db.prepare("UPDATE purchase_orders SET status=?, updated_at=? WHERE id=? AND organization_id=?")
      .bind(nextStatus, now, detail.po.id, input.organizationId),
    db.prepare(`
      INSERT INTO transaction_audit_events
        (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, 'GOODS_RECEIPT_POSTED', 'GOODS_RECEIPT', ?, ?, ?)
    `).bind(
      crypto.randomUUID(), input.organizationId, input.actorUserId, receiptId,
      JSON.stringify({ receiptNumber, purchaseOrderId: detail.po.id, lineCount: lines.length, poStatus: nextStatus }), now,
    ),
  );

  await db.batch(statements);
  return receiptId;
}
