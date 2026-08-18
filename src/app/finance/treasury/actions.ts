"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1, getD1SchemaStatus } from "@/lib/d1/context";
import { getMonthClosingReadiness } from "@/lib/d1/assets";
import {
  completeBankReconciliation,
  createAccountingPeriod,
  createBankReconciliation,
  createTreasuryAccount,
  postTreasuryEntry,
  setReconciliationItemMatch,
  transferTreasury,
  transitionAccountingPeriod,
} from "@/lib/d1/treasury";

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Proses treasury gagal.").slice(0, 220);
}

async function requirePermission(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/finance/treasury?error=Permission tidak tersedia.");
  const schema = await getD1SchemaStatus();
  if (!schema.features.treasuryPeriod) redirect("/setup/database");
  return access;
}

function refreshFinance() {
  revalidatePath("/finance/treasury");
  revalidatePath("/finance/closing-readiness");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

async function assertPeriodReadyToClose(organizationId: string, periodId: string) {
  const db = getD1();
  const period = await db.prepare(`
    SELECT id, period_code, period_start, period_end, status
    FROM accounting_periods
    WHERE id=? AND organization_id=? LIMIT 1
  `).bind(periodId, organizationId).first<{
    id: string;
    period_code: string;
    period_start: string;
    period_end: string;
    status: string;
  }>();
  if (!period) throw new Error("Periode akuntansi tidak ditemukan.");
  if (period.status !== "OPEN") throw new Error("Hanya periode OPEN yang dapat ditutup.");

  const readiness = await getMonthClosingReadiness(organizationId, period.period_code);
  const failed = readiness.checks.filter((check) => !check.passed);
  if (failed.length) {
    throw new Error(`Closing Readiness belum PASS: ${failed.map((check) => check.label).join(", ")}.`);
  }

  const endMs = Date.parse(`${period.period_end}T00:00:00+07:00`);
  if (!Number.isFinite(endMs)) throw new Error("Rentang periode akuntansi tidak valid.");
  const endExclusive = new Date(endMs + 86_400_000).toISOString();
  const openShift = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM teller_shifts
    WHERE organization_id=? AND status='OPEN' AND opened_at < ?
  `).bind(organizationId, endExclusive).first<{ count: number }>();
  const openCount = Number(openShift?.count ?? 0);
  if (openCount > 0) {
    throw new Error(`Masih ada ${openCount} shift teller OPEN yang dimulai sebelum akhir periode. Rekonsiliasi/tutup shift sebelum CLOSE.`);
  }
}

export async function createTreasuryAccountAction(formData: FormData) {
  const access = await requirePermission("TREASURY_MANAGE");
  let destination = "/finance/treasury?status=account-created";
  try {
    await createTreasuryAccount({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      code: String(formData.get("code") || ""),
      name: String(formData.get("name") || ""),
      accountType: String(formData.get("accountType") || "CASH") === "BANK" ? "BANK" : "CASH",
      chartAccountId: String(formData.get("chartAccountId") || ""),
      bankName: String(formData.get("bankName") || "") || null,
      accountReference: String(formData.get("accountReference") || "") || null,
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function postTreasuryEntryAction(formData: FormData) {
  const access = await requirePermission("TREASURY_MANAGE");
  let destination = "/finance/treasury?status=entry-posted";
  try {
    await postTreasuryEntry({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      treasuryAccountId: String(formData.get("treasuryAccountId") || ""),
      type: String(formData.get("type") || "EXPENSE") === "INCOME" ? "INCOME" : "EXPENSE",
      counterpartAccountId: String(formData.get("counterpartAccountId") || ""),
      amount: Math.trunc(Number(String(formData.get("amount") || "0"))),
      description: String(formData.get("description") || ""),
      referenceNumber: String(formData.get("referenceNumber") || "") || null,
      idempotencyKey: String(formData.get("idempotencyKey") || ""),
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function transferTreasuryAction(formData: FormData) {
  const access = await requirePermission("TREASURY_MANAGE");
  let destination = "/finance/treasury?status=transfer-posted";
  try {
    await transferTreasury({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      fromTreasuryAccountId: String(formData.get("fromTreasuryAccountId") || ""),
      toTreasuryAccountId: String(formData.get("toTreasuryAccountId") || ""),
      amount: Math.trunc(Number(String(formData.get("amount") || "0"))),
      description: String(formData.get("description") || ""),
      referenceNumber: String(formData.get("referenceNumber") || "") || null,
      idempotencyKey: String(formData.get("idempotencyKey") || ""),
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function createAccountingPeriodAction(formData: FormData) {
  const access = await requirePermission("PERIOD_CLOSE");
  let destination = "/finance/treasury?status=period-created";
  try {
    await createAccountingPeriod({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      month: String(formData.get("month") || ""),
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function closeAccountingPeriodAction(formData: FormData) {
  const access = await requirePermission("PERIOD_CLOSE");
  let destination = "/finance/treasury?status=period-closed";
  try {
    const periodId = String(formData.get("periodId") || "");
    await assertPeriodReadyToClose(access.organization.id, periodId);
    await transitionAccountingPeriod({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      periodId,
      action: "CLOSE",
      note: String(formData.get("note") || ""),
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function reopenAccountingPeriodAction(formData: FormData) {
  const access = await requirePermission("PERIOD_CLOSE");
  let destination = "/finance/treasury?status=period-reopened";
  try {
    await transitionAccountingPeriod({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      periodId: String(formData.get("periodId") || ""),
      action: "REOPEN",
      note: String(formData.get("note") || ""),
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function lockAccountingPeriodAction(formData: FormData) {
  const access = await requirePermission("PERIOD_LOCK");
  let destination = "/finance/treasury?status=period-locked";
  try {
    await transitionAccountingPeriod({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      periodId: String(formData.get("periodId") || ""),
      action: "LOCK",
      note: String(formData.get("note") || ""),
    });
    refreshFinance();
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function createBankReconciliationAction(formData: FormData) {
  const access = await requirePermission("BANK_RECONCILE");
  let destination = "/finance/treasury?status=reconciliation-created";
  try {
    const sessionId = await createBankReconciliation({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      treasuryAccountId: String(formData.get("treasuryAccountId") || ""),
      periodStart: String(formData.get("periodStart") || ""),
      periodEnd: String(formData.get("periodEnd") || ""),
      statementClosingBalance: Math.trunc(Number(String(formData.get("statementClosingBalance") || "0"))),
      notes: String(formData.get("notes") || "") || null,
    });
    revalidatePath("/finance/treasury");
    destination = `/finance/treasury/reconciliation/${sessionId}?status=created`;
  } catch (error) {
    destination = `/finance/treasury?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function setReconciliationItemMatchAction(formData: FormData) {
  const access = await requirePermission("BANK_RECONCILE");
  const sessionId = String(formData.get("sessionId") || "");
  let destination = `/finance/treasury/reconciliation/${encodeURIComponent(sessionId)}?status=item-updated`;
  try {
    await setReconciliationItemMatch({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      sessionId,
      itemId: String(formData.get("itemId") || ""),
      matched: String(formData.get("matched") || "0") === "1",
      note: String(formData.get("note") || "") || null,
    });
    revalidatePath(`/finance/treasury/reconciliation/${sessionId}`);
    revalidatePath("/finance/treasury");
  } catch (error) {
    destination = `/finance/treasury/reconciliation/${encodeURIComponent(sessionId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function completeBankReconciliationAction(formData: FormData) {
  const access = await requirePermission("BANK_RECONCILE");
  const sessionId = String(formData.get("sessionId") || "");
  let destination = `/finance/treasury/reconciliation/${encodeURIComponent(sessionId)}?status=reconciled`;
  try {
    await completeBankReconciliation({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      sessionId,
    });
    revalidatePath(`/finance/treasury/reconciliation/${sessionId}`);
    revalidatePath("/finance/treasury");
    revalidatePath("/finance");
  } catch (error) {
    destination = `/finance/treasury/reconciliation/${encodeURIComponent(sessionId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}
