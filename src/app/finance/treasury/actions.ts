"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
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
  revalidatePath("/finance");
  revalidatePath("/dashboard");
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
    await transitionAccountingPeriod({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      periodId: String(formData.get("periodId") || ""),
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
