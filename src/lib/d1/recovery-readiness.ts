import { getD1 } from "./context";
import { getSystemCapacitySummary, INTERNAL_SAFE_LIMIT_BYTES } from "./system-capacity";

type Row = Record<string, unknown>;

type BackupProvider = "D1" | "SUPABASE" | "BOTH";
type RestoreStatus = "PASSED" | "FAILED";

const MB = 1024 * 1024;
const WARNING_BYTES = 300 * MB;
const ARCHIVE_BYTES = 360 * MB;
const PROVIDER_LIMIT_BYTES = 500 * MB;

function parsePayload(value: unknown) {
  try { return JSON.parse(String(value || "{}")) as Record<string, unknown>; }
  catch { return {}; }
}

function daysBetween(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, ms / 86_400_000);
}

function daysToTarget(current: number | null, growthPerDay: number | null, target: number) {
  if (current === null || growthPerDay === null || growthPerDay <= 0 || current >= target) return null;
  return Math.ceil((target - current) / growthPerDay);
}

export async function getRecoveryReadiness(organizationId: string) {
  const db = getD1();
  const [capacity, snapshots, events] = await Promise.all([
    getSystemCapacitySummary(organizationId),
    db.prepare(`SELECT snapshot_date,d1_bytes,captured_at FROM system_capacity_snapshots
      WHERE organization_id=? AND d1_bytes IS NOT NULL ORDER BY snapshot_date ASC LIMIT 60`)
      .bind(organizationId).all<Row>(),
    db.prepare(`SELECT event_type,entity_id,payload_json,actor_user_id,created_at
      FROM transaction_audit_events
      WHERE organization_id=? AND entity_type='SYSTEM_RECOVERY'
        AND event_type IN ('BACKUP_EXTERNAL_RECORDED','RESTORE_TEST_RECORDED')
      ORDER BY created_at DESC LIMIT 40`)
      .bind(organizationId).all<Row>(),
  ]);

  const points = snapshots.results.map((row) => ({
    date: String(row.snapshot_date),
    bytes: Number(row.d1_bytes || 0),
  })).filter((row) => Number.isFinite(row.bytes) && row.bytes > 0);

  let growthPerDay: number | null = null;
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    const days = daysBetween(first.date, last.date);
    if (days > 0) growthPerDay = Math.max(0, (last.bytes - first.bytes) / days);
  }

  const history = events.results.map((row) => ({
    eventType: String(row.event_type),
    reference: String(row.entity_id),
    actorUserId: String(row.actor_user_id || ""),
    createdAt: String(row.created_at),
    payload: parsePayload(row.payload_json),
  }));
  const backups = history.filter((item) => item.eventType === "BACKUP_EXTERNAL_RECORDED");
  const restoreTests = history.filter((item) => item.eventType === "RESTORE_TEST_RECORDED");
  const latestBackup = backups[0] || null;
  const latestRestoreTest = restoreTests[0] || null;

  return {
    currentD1Bytes: capacity.d1Bytes,
    growthPerDay,
    projection: {
      warningDays: daysToTarget(capacity.d1Bytes, growthPerDay, WARNING_BYTES),
      archiveDays: daysToTarget(capacity.d1Bytes, growthPerDay, ARCHIVE_BYTES),
      internalLimitDays: daysToTarget(capacity.d1Bytes, growthPerDay, INTERNAL_SAFE_LIMIT_BYTES),
      providerLimitDays: daysToTarget(capacity.d1Bytes, growthPerDay, PROVIDER_LIMIT_BYTES),
    },
    latestBackup,
    latestRestoreTest,
    backupHistory: backups.slice(0, 20),
    restoreHistory: restoreTests.slice(0, 20),
  };
}

export async function recordExternalBackup(input: {
  organizationId: string;
  userId: string;
  provider: BackupProvider;
  reference: string;
  checksum?: string | null;
  byteSize?: number | null;
  note?: string | null;
}) {
  const reference = input.reference.trim();
  if (reference.length < 3 || reference.length > 180) throw new Error("BACKUP_REFERENCE_INVALID");
  const checksum = input.checksum?.trim() || null;
  if (checksum && checksum.length > 160) throw new Error("BACKUP_CHECKSUM_INVALID");
  const byteSize = input.byteSize == null ? null : Math.max(0, Math.trunc(input.byteSize));
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    provider: input.provider,
    reference,
    checksum,
    byteSize,
    note: input.note?.trim().slice(0, 500) || null,
  });

  await getD1().prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), input.organizationId, input.userId, "BACKUP_EXTERNAL_RECORDED", "SYSTEM_RECOVERY", reference, payload, now)
    .run();
  return { reference, recordedAt: now };
}

export async function recordRestoreTest(input: {
  organizationId: string;
  userId: string;
  backupReference: string;
  status: RestoreStatus;
  method: string;
  note?: string | null;
}) {
  const backupReference = input.backupReference.trim();
  const method = input.method.trim();
  if (backupReference.length < 3 || backupReference.length > 180) throw new Error("RESTORE_REFERENCE_INVALID");
  if (method.length < 3 || method.length > 160) throw new Error("RESTORE_METHOD_INVALID");
  const now = new Date().toISOString();
  const payload = JSON.stringify({
    backupReference,
    status: input.status,
    method,
    note: input.note?.trim().slice(0, 500) || null,
  });

  await getD1().prepare(`INSERT INTO transaction_audit_events
    (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), input.organizationId, input.userId, "RESTORE_TEST_RECORDED", "SYSTEM_RECOVERY", backupReference, payload, now)
    .run();
  return { backupReference, recordedAt: now };
}
