"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { recordExternalBackup, recordRestoreTest } from "@/lib/d1/recovery-readiness";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function recordBackupAction(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");

  const provider = text(formData, "provider");
  if (!(["D1", "SUPABASE", "BOTH"] as const).includes(provider as "D1" | "SUPABASE" | "BOTH")) {
    redirect("/capacity/recovery?error=provider");
  }
  const reference = text(formData, "reference");
  const checksum = text(formData, "checksum") || null;
  const sizeMbText = text(formData, "sizeMb");
  const sizeMb = sizeMbText ? Number(sizeMbText.replace(",", ".")) : null;
  const byteSize = sizeMb !== null && Number.isFinite(sizeMb) && sizeMb >= 0 ? Math.round(sizeMb * 1024 * 1024) : null;
  const note = text(formData, "note") || null;

  try {
    await recordExternalBackup({
      organizationId: access.organization.id,
      userId: access.user.id,
      provider: provider as "D1" | "SUPABASE" | "BOTH",
      reference,
      checksum,
      byteSize,
      note,
    });
  } catch {
    redirect("/capacity/recovery?error=backup");
  }

  revalidatePath("/capacity/recovery");
  revalidatePath("/capacity");
  redirect("/capacity/recovery?status=backup-recorded");
}

export async function recordRestoreTestAction(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");

  const status = text(formData, "status");
  if (status !== "PASSED" && status !== "FAILED") redirect("/capacity/recovery?error=restore-status");

  try {
    await recordRestoreTest({
      organizationId: access.organization.id,
      userId: access.user.id,
      backupReference: text(formData, "backupReference"),
      status: status as "PASSED" | "FAILED",
      method: text(formData, "method"),
      note: text(formData, "note") || null,
    });
  } catch {
    redirect("/capacity/recovery?error=restore");
  }

  revalidatePath("/capacity/recovery");
  revalidatePath("/capacity");
  redirect("/capacity/recovery?status=restore-recorded");
}
