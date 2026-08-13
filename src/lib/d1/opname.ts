import { getD1, type D1PreparedLike } from "./context";

export type InventoryPolicyRow = {
  id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  stock_qty: number;
  min_stock_qty: number;
  reorder_qty: number;
  expiry_warning_days: number;
};

export type StockOpnameSessionRow = {
  id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  session_number: string;
  status: string;
  notes: string | null;
  created_by: string;
  counted_by: string | null;
  approved_by: string | null;
  posted_by: string | null;
  created_at: string;
  counted_at: string | null;
  approved_at: string | null;
  posted_at: string | null;
  line_count: number;
  counted_line_count: number;
  variance_line_count: number;
};

export type StockOpnameLineRow = {
  id: string;
  session_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit_name: string;
  system_qty: number;
  physical_qty: number | null;
  variance_qty: number | null;
  unit_cost_amount: number;
  reason_text: string | null;
  evidence_reference: string | null;
  adjustment_movement_id: string | null;
  counted_at: string | null;
};

export type ExpiryCandidateRow = {
  movement_id: string;
  warehouse_code: string;
  product_id: string;
  sku: string;
  product_name: string;
  batch_code: string | null;
  expiry_date: string;
  quantity_received: number;
  warning_days: number;
};

function nowIso() {
  return new Date().toISOString();
}

function opnameNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `OPN-${y}${m}${d}-${hh}${mm}-${suffix}`;
}

export async function listInventoryPolicies(organizationId: string) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT
        ip.id,
        ip.warehouse_id,
        w.code AS warehouse_code,
        w.name AS warehouse_name,
        ip.product_id,
        p.sku,
        p.name AS product_name,
        COALESCE(SUM(im.quantity_delta), 0) AS stock_qty,
        ip.min_stock_qty,
        ip.reorder_qty,
        ip.expiry_warning_days
      FROM inventory_policies ip
      JOIN warehouses w ON w.id = ip.warehouse_id
      JOIN products p ON p.id = ip.product_id
      LEFT JOIN inventory_movements im
        ON im.organization_id = ip.organization_id
       AND im.warehouse_id = ip.warehouse_id
       AND im.product_id = ip.product_id
      WHERE ip.organization_id = ?
      GROUP BY ip.id
      ORDER BY w.name, p.name
    `)
    .bind(organizationId)
    .all<InventoryPolicyRow>();

  return result.results.map((row) => ({
    ...row,
    stock_qty: Number(row.stock_qty),
    min_stock_qty: Number(row.min_stock_qty),
    reorder_qty: Number(row.reorder_qty),
    expiry_warning_days: Number(row.expiry_warning_days),
  }));
}

export async function upsertInventoryPolicy(input: {
  organizationId: string;
  actorUserId: string;
  warehouseId: string;
  productId: string;
  minStockQty: number;
  reorderQty: number;
  expiryWarningDays: number;
}) {
  const db = getD1();
  const now = nowIso();
  const existing = await db
    .prepare("SELECT id FROM inventory_policies WHERE organization_id = ? AND warehouse_id = ? AND product_id = ? LIMIT 1")
    .bind(input.organizationId, input.warehouseId, input.productId)
    .first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();

  const policy = db
    .prepare(`
      INSERT INTO inventory_policies (
        id, organization_id, warehouse_id, product_id, min_stock_qty, reorder_qty,
        expiry_warning_days, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (organization_id, warehouse_id, product_id) DO UPDATE SET
        min_stock_qty = excluded.min_stock_qty,
        reorder_qty = excluded.reorder_qty,
        expiry_warning_days = excluded.expiry_warning_days,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `)
    .bind(
      id,
      input.organizationId,
      input.warehouseId,
      input.productId,
      input.minStockQty,
      input.reorderQty,
      input.expiryWarningDays,
      input.actorUserId,
      input.actorUserId,
      now,
      now,
    );

  const audit = db
    .prepare("INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'INVENTORY_POLICY_UPDATED', 'INVENTORY_POLICY', ?, ?, ?)")
    .bind(
      crypto.randomUUID(),
      input.organizationId,
      input.actorUserId,
      id,
      JSON.stringify({
        warehouseId: input.warehouseId,
        productId: input.productId,
        minStockQty: input.minStockQty,
        reorderQty: input.reorderQty,
        expiryWarningDays: input.expiryWarningDays,
      }),
      now,
    );

  await db.batch([policy, audit]);
  return id;
}

export async function listLowStockExceptions(organizationId: string) {
  const rows = await listInventoryPolicies(organizationId);
  return rows.filter((row) => row.stock_qty <= row.min_stock_qty);
}

export async function listExpiryCandidates(organizationId: string) {
  const db = getD1();
  const result = await db
    .prepare(`
      SELECT
        im.id AS movement_id,
        w.code AS warehouse_code,
        im.product_id,
        p.sku,
        p.name AS product_name,
        im.batch_code,
        im.expiry_date,
        im.quantity_delta AS quantity_received,
        COALESCE(ip.expiry_warning_days, 30) AS warning_days
      FROM inventory_movements im
      JOIN products p ON p.id = im.product_id
      JOIN warehouses w ON w.id = im.warehouse_id
      LEFT JOIN inventory_policies ip
        ON ip.organization_id = im.organization_id
       AND ip.warehouse_id = im.warehouse_id
       AND ip.product_id = im.product_id
      WHERE im.organization_id = ?
        AND im.quantity_delta > 0
        AND im.expiry_date IS NOT NULL
        AND date(im.expiry_date) <= date('now', '+' || COALESCE(ip.expiry_warning_days, 30) || ' day')
      ORDER BY date(im.expiry_date), p.name
      LIMIT 100
    `)
    .bind(organizationId)
    .all<ExpiryCandidateRow>();

  return result.results.map((row) => ({
    ...row,
    quantity_received: Number(row.quantity_received),
    warning_days: Number(row.warning_days),
  }));
}

export async function createStockOpnameSession(input: {
  organizationId: string;
  warehouseId: string;
  actorUserId: string;
  notes?: string | null;
}) {
  const db = getD1();
  const active = await db
    .prepare("SELECT id, session_number FROM stock_opname_sessions WHERE organization_id = ? AND warehouse_id = ? AND status IN ('DRAFT','COUNTING','COUNTED','APPROVED') ORDER BY created_at DESC LIMIT 1")
    .bind(input.organizationId, input.warehouseId)
    .first<{ id: string; session_number: string }>();

  if (active) {
    throw new Error(`Masih ada opname aktif ${active.session_number} untuk gudang ini.`);
  }

  const warehouse = await db
    .prepare("SELECT id FROM warehouses WHERE id = ? AND organization_id = ? AND status = 'ACTIVE' LIMIT 1")
    .bind(input.warehouseId, input.organizationId)
    .first<{ id: string }>();
  if (!warehouse) throw new Error("Gudang tidak ditemukan atau tidak aktif.");

  const stock = await db
    .prepare(`
      SELECT
        p.id AS product_id,
        p.cost_amount,
        COALESCE(SUM(im.quantity_delta), 0) AS stock_qty
      FROM products p
      LEFT JOIN inventory_movements im
        ON im.organization_id = p.organization_id
       AND im.product_id = p.id
       AND im.warehouse_id = ?
      WHERE p.organization_id = ?
        AND p.status = 'ACTIVE'
        AND p.track_stock = 1
      GROUP BY p.id
      ORDER BY p.name
    `)
    .bind(input.warehouseId, input.organizationId)
    .all<{ product_id: string; cost_amount: number; stock_qty: number }>();

  if (!stock.results.length) throw new Error("Tidak ada produk tracked-stock untuk dibuatkan opname.");

  const sessionId = crypto.randomUUID();
  const sessionNumber = opnameNumber();
  const now = nowIso();
  const statements: D1PreparedLike[] = [];

  statements.push(
    db.prepare("INSERT INTO stock_opname_sessions (id, organization_id, warehouse_id, session_number, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)")
      .bind(sessionId, input.organizationId, input.warehouseId, sessionNumber, input.notes || null, input.actorUserId, now, now),
  );

  for (const row of stock.results) {
    statements.push(
      db.prepare("INSERT INTO stock_opname_lines (id, session_id, product_id, system_qty, unit_cost_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(
          crypto.randomUUID(),
          sessionId,
          row.product_id,
          Number(row.stock_qty),
          Number(row.cost_amount),
          now,
          now,
        ),
    );
  }

  statements.push(
    db.prepare("INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'STOCK_OPNAME_CREATED', 'STOCK_OPNAME', ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        input.organizationId,
        input.actorUserId,
        sessionId,
        JSON.stringify({ sessionNumber, warehouseId: input.warehouseId, lineCount: stock.results.length }),
        now,
      ),
  );

  await db.batch(statements);
  return { id: sessionId, sessionNumber };
}

export async function listStockOpnameSessions(organizationId: string, limit = 30) {
  const db = getD1();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const result = await db
    .prepare(`
      SELECT
        s.id,
        s.warehouse_id,
        w.code AS warehouse_code,
        w.name AS warehouse_name,
        s.session_number,
        s.status,
        s.notes,
        s.created_by,
        s.counted_by,
        s.approved_by,
        s.posted_by,
        s.created_at,
        s.counted_at,
        s.approved_at,
        s.posted_at,
        COUNT(l.id) AS line_count,
        SUM(CASE WHEN l.physical_qty IS NOT NULL THEN 1 ELSE 0 END) AS counted_line_count,
        SUM(CASE WHEN COALESCE(l.variance_qty, 0) <> 0 THEN 1 ELSE 0 END) AS variance_line_count
      FROM stock_opname_sessions s
      JOIN warehouses w ON w.id = s.warehouse_id
      LEFT JOIN stock_opname_lines l ON l.session_id = s.id
      WHERE s.organization_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ${safeLimit}
    `)
    .bind(organizationId)
    .all<StockOpnameSessionRow>();

  return result.results.map((row) => ({
    ...row,
    line_count: Number(row.line_count),
    counted_line_count: Number(row.counted_line_count),
    variance_line_count: Number(row.variance_line_count),
  }));
}

export async function getStockOpnameSession(organizationId: string, sessionId: string) {
  const db = getD1();
  const session = await db
    .prepare(`
      SELECT s.*, w.code AS warehouse_code, w.name AS warehouse_name
      FROM stock_opname_sessions s
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.id = ? AND s.organization_id = ?
      LIMIT 1
    `)
    .bind(sessionId, organizationId)
    .first<StockOpnameSessionRow>();
  if (!session) return null;

  const lines = await db
    .prepare(`
      SELECT
        l.id,
        l.session_id,
        l.product_id,
        p.sku,
        p.name AS product_name,
        p.unit_name,
        l.system_qty,
        l.physical_qty,
        l.variance_qty,
        l.unit_cost_amount,
        l.reason_text,
        l.evidence_reference,
        l.adjustment_movement_id,
        l.counted_at
      FROM stock_opname_lines l
      JOIN products p ON p.id = l.product_id
      WHERE l.session_id = ?
      ORDER BY p.name
    `)
    .bind(sessionId)
    .all<StockOpnameLineRow>();

  return {
    session,
    lines: lines.results.map((row) => ({
      ...row,
      system_qty: Number(row.system_qty),
      physical_qty: row.physical_qty == null ? null : Number(row.physical_qty),
      variance_qty: row.variance_qty == null ? null : Number(row.variance_qty),
      unit_cost_amount: Number(row.unit_cost_amount),
    })),
  };
}

export async function recordStockOpnameCount(input: {
  organizationId: string;
  sessionId: string;
  lineId: string;
  physicalQty: number;
  reasonText?: string | null;
  evidenceReference?: string | null;
  actorUserId: string;
}) {
  const db = getD1();
  const line = await db
    .prepare(`
      SELECT l.id, l.system_qty, s.status
      FROM stock_opname_lines l
      JOIN stock_opname_sessions s ON s.id = l.session_id
      WHERE l.id = ? AND l.session_id = ? AND s.organization_id = ?
      LIMIT 1
    `)
    .bind(input.lineId, input.sessionId, input.organizationId)
    .first<{ id: string; system_qty: number; status: string }>();

  if (!line) throw new Error("Baris opname tidak ditemukan.");
  if (!['DRAFT', 'COUNTING'].includes(line.status)) throw new Error("Opname ini tidak lagi dapat dihitung.");
  if (!Number.isSafeInteger(input.physicalQty) || input.physicalQty < 0) throw new Error("Stok fisik harus bilangan bulat 0 atau lebih.");

  const variance = input.physicalQty - Number(line.system_qty);
  const reason = (input.reasonText || "").trim();
  if (variance !== 0 && reason.length < 5) {
    throw new Error("Alasan minimal 5 karakter wajib diisi jika ada selisih stok.");
  }

  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE stock_opname_lines SET physical_qty = ?, variance_qty = ?, reason_text = ?, evidence_reference = ?, counted_at = ?, updated_at = ? WHERE id = ?")
      .bind(input.physicalQty, variance, reason || null, input.evidenceReference || null, now, now, input.lineId),
    db.prepare("UPDATE stock_opname_sessions SET status = 'COUNTING', counted_by = ?, updated_at = ? WHERE id = ? AND status IN ('DRAFT','COUNTING')")
      .bind(input.actorUserId, now, input.sessionId),
  ]);

  return variance;
}

export async function submitStockOpname(input: {
  organizationId: string;
  sessionId: string;
  actorUserId: string;
}) {
  const db = getD1();
  const session = await db
    .prepare("SELECT id, status FROM stock_opname_sessions WHERE id = ? AND organization_id = ? LIMIT 1")
    .bind(input.sessionId, input.organizationId)
    .first<{ id: string; status: string }>();
  if (!session) throw new Error("Opname tidak ditemukan.");
  if (!['DRAFT', 'COUNTING'].includes(session.status)) throw new Error("Status opname tidak dapat disubmit.");

  const incomplete = await db
    .prepare("SELECT COUNT(*) AS total FROM stock_opname_lines WHERE session_id = ? AND physical_qty IS NULL")
    .bind(input.sessionId)
    .first<{ total: number }>();
  if (Number(incomplete?.total || 0) > 0) throw new Error("Semua produk harus dihitung sebelum opname disubmit.");

  const invalidReason = await db
    .prepare("SELECT id FROM stock_opname_lines WHERE session_id = ? AND COALESCE(variance_qty,0) <> 0 AND LENGTH(TRIM(COALESCE(reason_text,''))) < 5 LIMIT 1")
    .bind(input.sessionId)
    .first<{ id: string }>();
  if (invalidReason) throw new Error("Semua selisih stok harus memiliki alasan yang memadai.");

  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE stock_opname_sessions SET status = 'COUNTED', counted_by = ?, counted_at = ?, updated_at = ? WHERE id = ?")
      .bind(input.actorUserId, now, now, input.sessionId),
    db.prepare("INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'STOCK_OPNAME_COUNTED', 'STOCK_OPNAME', ?, '{}', ?)")
      .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, input.sessionId, now),
  ]);
}

async function currentWarehouseStock(organizationId: string, warehouseId: string, productId: string) {
  const db = getD1();
  const row = await db
    .prepare("SELECT COALESCE(SUM(quantity_delta),0) AS stock_qty FROM inventory_movements WHERE organization_id = ? AND warehouse_id = ? AND product_id = ?")
    .bind(organizationId, warehouseId, productId)
    .first<{ stock_qty: number }>();
  return Number(row?.stock_qty || 0);
}

export async function approveAndPostStockOpname(input: {
  organizationId: string;
  sessionId: string;
  actorUserId: string;
}) {
  const detail = await getStockOpnameSession(input.organizationId, input.sessionId);
  if (!detail) throw new Error("Opname tidak ditemukan.");
  if (detail.session.status !== "COUNTED") throw new Error("Opname harus berstatus COUNTED sebelum disetujui dan diposting.");

  for (const line of detail.lines) {
    const current = await currentWarehouseStock(input.organizationId, detail.session.warehouse_id, line.product_id);
    if (current !== line.system_qty) {
      throw new Error(`Stok ${line.sku} berubah dari snapshot ${line.system_qty} menjadi ${current}. Batalkan dan buat opname baru agar adjustment tidak salah.`);
    }
  }

  const db = getD1();
  const now = nowIso();
  const statements: D1PreparedLike[] = [];
  let varianceLines = 0;
  let netVariance = 0;

  for (const line of detail.lines) {
    const variance = Number(line.variance_qty || 0);
    if (variance === 0) continue;
    varianceLines += 1;
    netVariance += variance;
    const movementId = crypto.randomUUID();
    statements.push(
      db.prepare("INSERT INTO inventory_movements (id, organization_id, warehouse_id, product_id, movement_type, quantity_delta, unit_cost_amount, reference_type, reference_id, actor_user_id, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'STOCK_OPNAME', ?, ?, ?, ?)")
        .bind(
          movementId,
          input.organizationId,
          detail.session.warehouse_id,
          line.product_id,
          variance > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          variance,
          line.unit_cost_amount,
          input.sessionId,
          input.actorUserId,
          now,
          now,
        ),
    );
    statements.push(
      db.prepare("UPDATE stock_opname_lines SET adjustment_movement_id = ?, updated_at = ? WHERE id = ?")
        .bind(movementId, now, line.id),
    );
  }

  statements.push(
    db.prepare("UPDATE stock_opname_sessions SET status = 'POSTED', approved_by = ?, approved_at = ?, posted_by = ?, posted_at = ?, updated_at = ? WHERE id = ? AND status = 'COUNTED'")
      .bind(input.actorUserId, now, input.actorUserId, now, now, input.sessionId),
  );
  statements.push(
    db.prepare("INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'STOCK_OPNAME_POSTED', 'STOCK_OPNAME', ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        input.organizationId,
        input.actorUserId,
        input.sessionId,
        JSON.stringify({
          varianceLines,
          netVariance,
          controlMode: "MANAGER_APPROVAL_PHASE_1_4",
        }),
        now,
      ),
  );

  await db.batch(statements);
  return { varianceLines, netVariance };
}

export async function cancelStockOpname(input: {
  organizationId: string;
  sessionId: string;
  actorUserId: string;
}) {
  const db = getD1();
  const now = nowIso();
  const result = await db
    .prepare("UPDATE stock_opname_sessions SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND organization_id = ? AND status IN ('DRAFT','COUNTING','COUNTED')")
    .bind(now, input.sessionId, input.organizationId)
    .run();
  if (!result.success) throw new Error("Gagal membatalkan opname.");

  await db
    .prepare("INSERT INTO transaction_audit_events (id, organization_id, actor_user_id, event_type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, 'STOCK_OPNAME_CANCELLED', 'STOCK_OPNAME', ?, '{}', ?)")
    .bind(crypto.randomUUID(), input.organizationId, input.actorUserId, input.sessionId, now)
    .run();
}
