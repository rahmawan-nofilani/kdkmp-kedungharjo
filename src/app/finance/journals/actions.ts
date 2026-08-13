"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import {
  approveAndPostControlledJournal,
  cancelControlledJournal,
  createControlledJournal,
  getControlledJournalDetail,
  rejectControlledJournal,
  reverseControlledJournal,
  saveControlledJournalDraft,
  submitControlledJournal,
} from "@/lib/d1/controlled-journal";

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Proses controlled journal gagal.").slice(0, 220);
}

async function requirePermission(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/finance/journals?error=Permission tidak tersedia.");
  const schema = await getD1SchemaStatus();
  if (!schema.features.controlledJournal) redirect("/setup/database");
  return access;
}

async function requireMakerAccess(journalId: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const detail = await getControlledJournalDetail(access.organization.id, journalId);
  if (!detail) redirect("/finance/journals?error=Jurnal tidak ditemukan.");
  const needed = detail.header.journal_type === "OPENING" ? "OPENING_BALANCE_MANAGE" : "JOURNAL_CREATE";
  if (!access.permissions.includes(needed)) redirect(`/finance/journals/${encodeURIComponent(journalId)}?error=Permission tidak tersedia.`);
  const schema = await getD1SchemaStatus();
  if (!schema.features.controlledJournal) redirect("/setup/database");
  return { access, detail };
}

function refreshFinance(id?: string) {
  revalidatePath("/finance/journals");
  if (id) revalidatePath(`/finance/journals/${id}`);
  revalidatePath("/finance");
  revalidatePath("/finance/treasury");
  revalidatePath("/dashboard");
}

export async function createControlledJournalAction(formData: FormData) {
  const type = String(formData.get("journalType") || "MANUAL") === "OPENING" ? "OPENING" : "MANUAL";
  const access = await requirePermission(type === "OPENING" ? "OPENING_BALANCE_MANAGE" : "JOURNAL_CREATE");
  let destination = "/finance/journals";
  try {
    const id = await createControlledJournal({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      journalDate: String(formData.get("journalDate") || ""),
      journalType: type,
      description: String(formData.get("description") || ""),
    });
    refreshFinance(id);
    destination = `/finance/journals/${id}?status=created`;
  } catch (error) {
    destination = `/finance/journals?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function saveControlledJournalDraftAction(formData: FormData) {
  const journalId = String(formData.get("journalId") || "");
  const { access } = await requireMakerAccess(journalId);
  let destination = `/finance/journals/${encodeURIComponent(journalId)}?status=draft-saved`;
  try {
    const lines = JSON.parse(String(formData.get("linesJson") || "[]")) as Array<{ accountId: string; debitAmount: number; creditAmount: number; memo?: string }>;
    await saveControlledJournalDraft({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      journalId,
      journalDate: String(formData.get("journalDate") || ""),
      description: String(formData.get("description") || ""),
      lines,
    });
    refreshFinance(journalId);
  } catch (error) {
    destination = `/finance/journals/${encodeURIComponent(journalId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function submitControlledJournalAction(formData: FormData) {
  const journalId = String(formData.get("journalId") || "");
  const { access } = await requireMakerAccess(journalId);
  let destination = `/finance/journals/${encodeURIComponent(journalId)}?status=submitted`;
  try {
    await submitControlledJournal({ organizationId: access.organization.id, actorUserId: access.user.id, journalId });
    refreshFinance(journalId);
  } catch (error) {
    destination = `/finance/journals/${encodeURIComponent(journalId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function cancelControlledJournalAction(formData: FormData) {
  const journalId = String(formData.get("journalId") || "");
  const { access } = await requireMakerAccess(journalId);
  let destination = "/finance/journals?status=cancelled";
  try {
    await cancelControlledJournal({ organizationId: access.organization.id, actorUserId: access.user.id, journalId });
    refreshFinance(journalId);
  } catch (error) {
    destination = `/finance/journals/${encodeURIComponent(journalId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function approveAndPostControlledJournalAction(formData: FormData) {
  const access = await requirePermission("JOURNAL_APPROVE");
  const journalId = String(formData.get("journalId") || "");
  let destination = `/finance/journals/${encodeURIComponent(journalId)}?status=posted`;
  try {
    await approveAndPostControlledJournal({ organizationId: access.organization.id, actorUserId: access.user.id, journalId });
    refreshFinance(journalId);
  } catch (error) {
    destination = `/finance/journals/${encodeURIComponent(journalId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function rejectControlledJournalAction(formData: FormData) {
  const access = await requirePermission("JOURNAL_APPROVE");
  const journalId = String(formData.get("journalId") || "");
  let destination = `/finance/journals/${encodeURIComponent(journalId)}?status=rejected`;
  try {
    await rejectControlledJournal({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      journalId,
      reason: String(formData.get("reason") || ""),
    });
    refreshFinance(journalId);
  } catch (error) {
    destination = `/finance/journals/${encodeURIComponent(journalId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}

export async function reverseControlledJournalAction(formData: FormData) {
  const access = await requirePermission("JOURNAL_REVERSE");
  const journalId = String(formData.get("journalId") || "");
  let destination = `/finance/journals/${encodeURIComponent(journalId)}?status=reversed`;
  try {
    await reverseControlledJournal({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      journalId,
      reason: String(formData.get("reason") || ""),
      reversalDate: String(formData.get("reversalDate") || ""),
    });
    refreshFinance(journalId);
  } catch (error) {
    destination = `/finance/journals/${encodeURIComponent(journalId)}?error=${encodeURIComponent(safeMessage(error))}`;
  }
  redirect(destination);
}
