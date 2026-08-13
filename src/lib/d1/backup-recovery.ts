import { getD1, getD1SchemaStatus } from "./context";

export const BACKUP_FORMAT_VERSION = "kdkmp-d1-logical-backup-v1";

type Row = Record<string, unknown>;
type TableMap = Record<string, Row[]>;

const DIRECT_ORG_TABLES = [
  "products",
  "warehouses",
  "inventory_movements",
  "teller_shifts",
  "sales",
  "payments",
  "journal_entries",
  "request_idempotency",
  "transaction_audit_events",
  "inventory_policies",
  "stock_opname_sessions",
  "suppliers",
  "purchase_requests",
  "purchase_orders",
  "goods_receipts",
  "supplier_invoices",
  "supplier_payments",
  "chart_of_accounts",
  "accounting_mappings",
  "treasury_accounts",
  "treasury_transactions",
  "accounting_periods",
  "bank_reconciliation_sessions",
  "controlled_journals",
  "fixed_assets",
  "asset_depreciation_runs",
  "system_capacity_snapshots",
] as const;

const CHILD_TABLES: Array<{ name: string; sql: string }> = [
  { name: "sale_lines", sql: "SELECT sl.* FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id WHERE s.organization_id=?" },
  { name: "journal_lines", sql: "SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.organization_id=?" },
  { name: "stock_opname_lines", sql: "SELECT sol.* FROM stock_opname_lines sol JOIN stock_opname_sessions sos ON sos.id=sol.session_id WHERE sos.organization_id=?" },
  { name: "purchase_request_items", sql: "SELECT pri.* FROM purchase_request_items pri JOIN purchase_requests pr ON pr.id=pri.purchase_request_id WHERE pr.organization_id=?" },
  { name: "purchase_order_items", sql: "SELECT poi.* FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE po.organization_id=?" },
  { name: "goods_receipt_items", sql: "SELECT gri.* FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id=gri.goods_receipt_id WHERE gr.organization_id=?" },
  { name: "supplier_invoice_items", sql: "SELECT sii.* FROM supplier_invoice_items sii JOIN supplier_invoices si ON si.id=sii.supplier_invoice_id WHERE si.organization_id=?" },
  { name: "accounting_mapping_versions", sql: "SELECT amv.* FROM accounting_mapping_versions amv JOIN accounting_mappings am ON am.id=amv.mapping_id WHERE am.organization_id=?" },
  { name: "bank_reconciliation_items", sql: "SELECT bri.* FROM bank_reconciliation_items bri JOIN bank_reconciliation_sessions brs ON brs.id=bri.session_id WHERE brs.organization_id=?" },
  { name: "controlled_journal_lines", sql: "SELECT cjl.* FROM controlled_journal_lines cjl JOIN controlled_journals cj ON cj.id=cjl.controlled_journal_id WHERE cj.organization_id=?" },
  { name: "asset_depreciation_lines", sql: "SELECT adl.* FROM asset_depreciation_lines adl JOIN asset_depreciation_runs adr ON adr.id=adl.run_id WHERE adr.organization_id=?" },
];

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function backupNumber(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `BKP-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function directTable(table: string, organizationId: string) {
  const db = getD1();
  const result = await db.prepare(`SELECT * FROM ${table} WHERE organization_id=?`).bind(organizationId).all<Row>();
  return result.results;
}

async function childTable(sql: string, organizationId: string) {
  const db = getD1();
  const result = await db.prepare(sql).bind(organizationId).all<Row>();
  return result.results;
}

export async function buildOrganizationD1Backup(input: {
  organizationId: string;
  organizationName: string;
  generatedBy: string;
}) {
  const schema = await getD1SchemaStatus();
  if (!schema.features.backupRecovery) throw new Error("BACKUP_SCHEMA_NOT_READY");

  const [direct, children] = await Promise.all([
    Promise.all(DIRECT_ORG_TABLES.map(async (name) => [name, await directTable(name, input.organizationId)] as const)),
    Promise.all(CHILD_TABLES.map(async (item) => [item.name, await childTable(item.sql, input.organizationId)] as const)),
  ]);

  const tables: TableMap = Object.fromEntries([...direct, ...children]);
  const tableNames = Object.keys(tables).sort();
  const rowCounts = Object.fromEntries(tableNames.map((name) => [name, tables[name].length]));
  const rowCount = tableNames.reduce((total, name) => total + tables[name].length, 0);
  const generatedAt = new Date().toISOString();
  const number = backupNumber(new Date(generatedAt));
  const tablePayload = JSON.stringify(tables);
  const checksum = await sha256Hex(tablePayload);

  const backup = {
    metadata: {
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: schema.currentVersion,
      backupNumber: number,
      scope: "ORGANIZATION",
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      generatedAt,
      generatedBy: input.generatedBy,
    },
    summary: {
      tableCount: tableNames.length,
      rowCount,
      rowCounts,
    },
    integrity: {
      algorithm: "SHA-256",
      checksumTarget: "tables-json",
      checksumSha256: checksum,
    },
    tables,
  };

  const json = JSON.stringify(backup, null, 2);
  const byteSize = new TextEncoder().encode(json).byteLength;
  const db = getD1();
  await db.prepare(`INSERT INTO backup_runs
    (id,organization_id,backup_number,format_version,schema_version,scope,status,table_count,row_count,byte_size,checksum_sha256,generated_by,generated_at)
    VALUES (?,?,?,?,?,'ORGANIZATION','GENERATED',?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), input.organizationId, number, BACKUP_FORMAT_VERSION, schema.currentVersion || "unknown",
      tableNames.length, rowCount, byteSize, checksum, input.generatedBy, generatedAt)
    .run();

  return {
    backupNumber: number,
    checksumSha256: checksum,
    byteSize,
    rowCount,
    tableCount: tableNames.length,
    fileName: `kdkmp-d1-backup-${generatedAt.slice(0, 10)}-${number.slice(-8)}.json`,
    json,
  };
}

export async function listBackupRuns(organizationId: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const db = getD1();
  const result = await db.prepare(`SELECT id,backup_number,format_version,schema_version,status,table_count,row_count,byte_size,checksum_sha256,generated_by,generated_at,verified_by,verified_at,verification_note
    FROM backup_runs WHERE organization_id=? ORDER BY generated_at DESC LIMIT ${safeLimit}`)
    .bind(organizationId).all<Row>();
  return result.results;
}

export async function listRestoreTests(organizationId: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const db = getD1();
  const result = await db.prepare(`SELECT id,backup_run_id,backup_number,checksum_sha256,status,test_type,detail,tested_by,tested_at
    FROM backup_restore_tests WHERE organization_id=? ORDER BY tested_at DESC LIMIT ${safeLimit}`)
    .bind(organizationId).all<Row>();
  return result.results;
}
