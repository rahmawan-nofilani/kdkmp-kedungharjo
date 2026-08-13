"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import {
  approveAndPostStockOpname,
  cancelStockOpname,
  createStockOpnameSession,
  recordStockOpnameCount,
  submitStockOpname,
  upsertInventoryPolicy,
} from "@/lib/d1/opname";

function text(formData: FormData, key: string, max = 240) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function nonNegativeInt(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "0"));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${key} harus bilangan bulat 0 atau lebih.`);
  return value;
}

async function requireInventoryControl(manager = false) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("INVENTORY_VIEW")) redirect("/dashboard");
  if (manager && !access.permissions.includes("ORG_MANAGE")) redirect("/inventory/opname?error=forbidden");

  const schema = await getD1SchemaStatus();
  if (!schema.current) redirect("/setup/database");
  return access;
}

function errorDestination(base: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Proses inventory control gagal.";
  return `${base}${base.includes("?") ? "&" : "?"}error=${encodeURIComponent(message.slice(0, 220))}`;
}

export async function saveInventoryPolicyAction(formData: FormData) {
  const access = await requireInventoryControl(true);
  let destination = "/inventory/opname?status=policy-saved";

  try {
    const warehouseId = text(formData, "warehouseId", 80);
    const productId = text(formData, "productId", 80);
    const minStockQty = nonNegativeInt(formData, "minStockQty");
    const reorderQty = nonNegativeInt(formData, "reorderQty");
    const expiryWarningDays = nonNegativeInt(formData, "expiryWarningDays");
    if (!warehouseId || !productId) throw new Error("Gudang dan produk wajib dipilih.");

    await upsertInventoryPolicy({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      warehouseId,
      productId,
      minStockQty,
      reorderQty,
      expiryWarningDays,
    });
  } catch (error) {
    destination = errorDestination("/inventory/opname", error);
  }

  revalidatePath("/inventory/opname");
  redirect(destination);
}

export async function createStockOpnameAction(formData: FormData) {
  const access = await requireInventoryControl(true);
  let destination = "/inventory/opname";

  try {
    const warehouseId = text(formData, "warehouseId", 80);
    const notes = text(formData, "notes", 240);
    if (!warehouseId) throw new Error("Gudang wajib dipilih.");
    const result = await createStockOpnameSession({
      organizationId: access.organization.id,
      warehouseId,
      actorUserId: access.user.id,
      notes: notes || null,
    });
    destination = `/inventory/opname/${result.id}?status=created`;
  } catch (error) {
    destination = errorDestination("/inventory/opname", error);
  }

  revalidatePath("/inventory/opname");
  redirect(destination);
}

export async function recordStockOpnameCountAction(formData: FormData) {
  const access = await requireInventoryControl(true);
  const sessionId = text(formData, "sessionId", 80);
  let destination = `/inventory/opname/${sessionId}?status=count-saved`;

  try {
    const lineId = text(formData, "lineId", 80);
    const physicalQty = nonNegativeInt(formData, "physicalQty");
    const reasonText = text(formData, "reasonText", 200);
    const evidenceReference = text(formData, "evidenceReference", 240);
    if (!sessionId || !lineId) throw new Error("Session/baris opname tidak valid.");

    await recordStockOpnameCount({
      organizationId: access.organization.id,
      sessionId,
      lineId,
      physicalQty,
      reasonText: reasonText || null,
      evidenceReference: evidenceReference || null,
      actorUserId: access.user.id,
    });
  } catch (error) {
    destination = errorDestination(`/inventory/opname/${sessionId}`, error);
  }

  revalidatePath(`/inventory/opname/${sessionId}`);
  revalidatePath("/inventory/opname");
  redirect(destination);
}

export async function submitStockOpnameAction(formData: FormData) {
  const access = await requireInventoryControl(true);
  const sessionId = text(formData, "sessionId", 80);
  let destination = `/inventory/opname/${sessionId}?status=counted`;

  try {
    await submitStockOpname({
      organizationId: access.organization.id,
      sessionId,
      actorUserId: access.user.id,
    });
  } catch (error) {
    destination = errorDestination(`/inventory/opname/${sessionId}`, error);
  }

  revalidatePath(`/inventory/opname/${sessionId}`);
  revalidatePath("/inventory/opname");
  redirect(destination);
}

export async function approveAndPostStockOpnameAction(formData: FormData) {
  const access = await requireInventoryControl(true);
  const sessionId = text(formData, "sessionId", 80);
  let destination = `/inventory/opname/${sessionId}?status=posted`;

  try {
    await approveAndPostStockOpname({
      organizationId: access.organization.id,
      sessionId,
      actorUserId: access.user.id,
    });
  } catch (error) {
    destination = errorDestination(`/inventory/opname/${sessionId}`, error);
  }

  revalidatePath(`/inventory/opname/${sessionId}`);
  revalidatePath("/inventory/opname");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  redirect(destination);
}

export async function cancelStockOpnameAction(formData: FormData) {
  const access = await requireInventoryControl(true);
  const sessionId = text(formData, "sessionId", 80);
  let destination = "/inventory/opname?status=cancelled";

  try {
    await cancelStockOpname({
      organizationId: access.organization.id,
      sessionId,
      actorUserId: access.user.id,
    });
  } catch (error) {
    destination = errorDestination(`/inventory/opname/${sessionId}`, error);
  }

  revalidatePath(`/inventory/opname/${sessionId}`);
  revalidatePath("/inventory/opname");
  redirect(destination);
}
