"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { closeTellerShift, openTellerShift } from "@/lib/d1/teller";

function money(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replace(/[^0-9]/g, "");
  const value = Number(raw || "0");
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Nilai kas tidak valid.");
  return value;
}

async function requireTellerAccess() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS")) redirect("/dashboard");
  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");
  return access;
}

export async function openShiftAction(formData: FormData) {
  const access = await requireTellerAccess();
  let destination = "/teller?status=shift-opened";

  try {
    const openingCashAmount = money(formData, "openingCashAmount");
    await openTellerShift({
      organizationId: access.organization.id,
      unitId: access.units[0]?.id ?? null,
      tellerUserId: access.user.id,
      openingCashAmount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuka shift.";
    destination = `/teller?error=${encodeURIComponent(message.slice(0, 160))}`;
  }

  revalidatePath("/teller");
  redirect(destination);
}

export async function closeShiftAction(formData: FormData) {
  const access = await requireTellerAccess();
  let destination = "/teller?status=shift-closed";

  try {
    const countedCashAmount = money(formData, "countedCashAmount");
    const result = await closeTellerShift({
      organizationId: access.organization.id,
      tellerUserId: access.user.id,
      countedCashAmount,
    });
    destination = `/teller?status=shift-closed&variance=${result.varianceAmount}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menutup shift.";
    destination = `/teller?error=${encodeURIComponent(message.slice(0, 160))}`;
  }

  revalidatePath("/teller");
  redirect(destination);
}
