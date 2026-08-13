"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import {
  createAccount,
  createMappingDraft,
  decideMappingDraft,
  setAccountStatus,
} from "@/lib/d1/accounting-config";
import { getD1SchemaStatus } from "@/lib/d1/context";

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Proses accounting configuration gagal.").slice(0, 200);
}

async function requireAccess(permission: "ACCOUNTING_MANAGE" | "ACCOUNTING_APPROVE") {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/finance/settings?error=Permission tidak tersedia.");
  const schema = await getD1SchemaStatus();
  if (schema.currentVersion !== "accounting_config_v5") redirect("/setup/database");
  return access;
}

export async function createAccountAction(formData: FormData) {
  const access = await requireAccess("ACCOUNTING_MANAGE");
  try {
    await createAccount({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      accountType: String(formData.get("accountType") ?? "") as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
      normalBalance: String(formData.get("normalBalance") ?? "") as "DEBIT" | "CREDIT",
    });
    revalidatePath("/finance/settings");
    revalidatePath("/finance");
  } catch (error) {
    redirect(`/finance/settings?error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect("/finance/settings?status=account-created");
}

export async function setAccountStatusAction(formData: FormData) {
  const access = await requireAccess("ACCOUNTING_MANAGE");
  try {
    await setAccountStatus({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      accountId: String(formData.get("accountId") ?? ""),
      status: String(formData.get("status") ?? "") as "ACTIVE" | "INACTIVE" | "ARCHIVED",
    });
    revalidatePath("/finance/settings");
  } catch (error) {
    redirect(`/finance/settings?error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect("/finance/settings?status=account-status-updated");
}

export async function createMappingDraftAction(formData: FormData) {
  const access = await requireAccess("ACCOUNTING_MANAGE");
  try {
    await createMappingDraft({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      eventCode: String(formData.get("eventCode") ?? ""),
      debitAccountId: String(formData.get("debitAccountId") ?? ""),
      creditAccountId: String(formData.get("creditAccountId") ?? ""),
      changeNote: String(formData.get("changeNote") ?? ""),
    });
    revalidatePath("/finance/settings");
  } catch (error) {
    redirect(`/finance/settings?error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect("/finance/settings?status=mapping-draft-created");
}

export async function approveMappingDraftAction(formData: FormData) {
  const access = await requireAccess("ACCOUNTING_APPROVE");
  try {
    await decideMappingDraft({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      versionId: String(formData.get("versionId") ?? ""),
      decision: "APPROVE",
    });
    revalidatePath("/finance/settings");
  } catch (error) {
    redirect(`/finance/settings?error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect("/finance/settings?status=mapping-approved");
}

export async function rejectMappingDraftAction(formData: FormData) {
  const access = await requireAccess("ACCOUNTING_APPROVE");
  try {
    await decideMappingDraft({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      versionId: String(formData.get("versionId") ?? ""),
      decision: "REJECT",
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/finance/settings");
  } catch (error) {
    redirect(`/finance/settings?error=${encodeURIComponent(safeMessage(error))}`);
  }
  redirect("/finance/settings?status=mapping-rejected");
}
