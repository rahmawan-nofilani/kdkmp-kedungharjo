import { getD1 } from "./context";

export const PROVIDER_FREE_LIMIT_BYTES = 500 * 1024 * 1024;
export const INTERNAL_SAFE_LIMIT_BYTES = 400 * 1024 * 1024;
export const LIMITS_VERIFIED_AT = "2026-08-13";

export type CapacitySnapshot = {
  snapshot_date: string;
  d1_bytes: number | null;
  supabase_bytes: number | null;
  member_count: number;
  sales_30d: number;
  sales_total: number;
  journal_entries_total: number;
  inventory_movements_total: number;
  audit_events_total: number;
  captured_at: string;
};

function firstNumber(row: Record<string, unknown> | null, preferred: string) {
  if (!row) return null;
  const direct = Number(row[preferred]);
  if (Number.isFinite(direct)) return direct;
  for (const value of Object.values(row)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function readD1DatabaseBytes() {
  try {
    const db = getD1();
    const [countRow, sizeRow] = await Promise.all([
      db.prepare("PRAGMA page_count").first<Record<string, unknown>>(),
      db.prepare("PRAGMA page_size").first<Record<string, unknown>>(),
    ]);
    const pages = firstNumber(countRow, "page_count");
    const pageSize = firstNumber(sizeRow, "page_size");
    if (pages === null || pageSize === null) return null;
    return pages * pageSize;
  } catch {
    return null;
  }
}

export async function getSystemCapacitySummary(organizationId: string) {
  const db = getD1();
  const [d1Bytes, counts, snapshots] = await Promise.all([
    readD1DatabaseBytes(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM sales WHERE organization_id=?) AS sales_total,
      (SELECT COUNT(*) FROM sales WHERE organization_id=? AND sold_at >= datetime('now','-30 days')) AS sales_30d,
      (SELECT COUNT(*) FROM journal_entries WHERE organization_id=?) AS journal_entries_total,
      (SELECT COUNT(*) FROM inventory_movements WHERE organization_id=?) AS inventory_movements_total,
      (SELECT COUNT(*) FROM transaction_audit_events WHERE organization_id=?) AS audit_events_total
    `).bind(organizationId, organizationId, organizationId, organizationId, organizationId).first<Record<string, unknown>>(),
    db.prepare("SELECT snapshot_date,d1_bytes,supabase_bytes,member_count,sales_30d,sales_total,journal_entries_total,inventory_movements_total,audit_events_total,captured_at FROM system_capacity_snapshots WHERE organization_id=? ORDER BY snapshot_date DESC LIMIT 30")
      .bind(organizationId).all<CapacitySnapshot>(),
  ]);

  const n = (key: string) => Number(counts?.[key] ?? 0);
  return {
    d1Bytes,
    salesTotal: n("sales_total"),
    sales30d: n("sales_30d"),
    journalEntriesTotal: n("journal_entries_total"),
    inventoryMovementsTotal: n("inventory_movements_total"),
    auditEventsTotal: n("audit_events_total"),
    snapshots: snapshots.results.map((row) => ({ ...row,
      d1_bytes: row.d1_bytes === null ? null : Number(row.d1_bytes),
      supabase_bytes: row.supabase_bytes === null ? null : Number(row.supabase_bytes),
      member_count: Number(row.member_count), sales_30d: Number(row.sales_30d), sales_total: Number(row.sales_total),
      journal_entries_total: Number(row.journal_entries_total), inventory_movements_total: Number(row.inventory_movements_total), audit_events_total: Number(row.audit_events_total),
    })),
  };
}

export async function saveCapacitySnapshot(input: {
  organizationId: string;
  userId: string;
  memberCount: number;
  supabaseBytes?: number | null;
}) {
  const summary = await getSystemCapacitySummary(input.organizationId);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const now = new Date().toISOString();
  const db = getD1();
  await db.prepare(`INSERT INTO system_capacity_snapshots
    (id,organization_id,snapshot_date,d1_bytes,supabase_bytes,member_count,sales_30d,sales_total,journal_entries_total,inventory_movements_total,audit_events_total,captured_by,source,captured_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'MANUAL', ?)
    ON CONFLICT(organization_id,snapshot_date) DO UPDATE SET
      d1_bytes=excluded.d1_bytes, supabase_bytes=excluded.supabase_bytes, member_count=excluded.member_count,
      sales_30d=excluded.sales_30d, sales_total=excluded.sales_total, journal_entries_total=excluded.journal_entries_total,
      inventory_movements_total=excluded.inventory_movements_total, audit_events_total=excluded.audit_events_total,
      captured_by=excluded.captured_by, captured_at=excluded.captured_at
  `).bind(crypto.randomUUID(), input.organizationId, date, summary.d1Bytes, input.supabaseBytes ?? null, input.memberCount,
    summary.sales30d, summary.salesTotal, summary.journalEntriesTotal, summary.inventoryMovementsTotal, summary.auditEventsTotal,
    input.userId, now).run();
  return { date };
}
