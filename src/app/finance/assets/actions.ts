"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { activateFixedAsset, createDepreciationRun, createFixedAsset, postDepreciationRun } from "@/lib/d1/assets";

function message(error: unknown) {
  return (error instanceof Error ? error.message : "Proses aset gagal.").slice(0,220);
}

async function requirePermission(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/finance/assets?error=Permission tidak tersedia.");
  const schema = await getD1SchemaStatus();
  if (!schema.features.assetDepreciation) redirect("/setup/database");
  return access;
}

function refresh() {
  revalidatePath("/finance/assets");
  revalidatePath("/finance/closing-readiness");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

function intValue(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) || "0").replace(/[^0-9-]/g,""));
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

export async function createFixedAssetAction(formData: FormData) {
  const access = await requirePermission("ASSET_MANAGE");
  let destination = "/finance/assets?status=aset-draft-dibuat";
  try {
    await createFixedAsset({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      assetCode: String(formData.get("assetCode") || ""),
      name: String(formData.get("name") || ""),
      category: String(formData.get("category") || "") || null,
      acquisitionDate: String(formData.get("acquisitionDate") || ""),
      inServiceDate: String(formData.get("inServiceDate") || ""),
      acquisitionCostAmount: intValue(formData,"acquisitionCostAmount"),
      residualValueAmount: intValue(formData,"residualValueAmount"),
      usefulLifeMonths: intValue(formData,"usefulLifeMonths"),
      assetAccountId: String(formData.get("assetAccountId") || ""),
      accumulatedDepreciationAccountId: String(formData.get("accumulatedDepreciationAccountId") || ""),
      depreciationExpenseAccountId: String(formData.get("depreciationExpenseAccountId") || ""),
      notes: String(formData.get("notes") || "") || null,
    });
    refresh();
  } catch (error) {
    destination = `/finance/assets?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function activateFixedAssetAction(formData: FormData) {
  const access = await requirePermission("ASSET_APPROVE");
  let destination = "/finance/assets?status=aset-diaktifkan";
  try {
    await activateFixedAsset({ organizationId:access.organization.id, actorUserId:access.user.id, assetId:String(formData.get("assetId")||"") });
    refresh();
  } catch (error) {
    destination = `/finance/assets?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function createDepreciationRunAction(formData: FormData) {
  const access = await requirePermission("ASSET_MANAGE");
  let destination = "/finance/assets?status=perhitungan-penyusutan-dibuat";
  try {
    await createDepreciationRun({
      organizationId:access.organization.id,
      actorUserId:access.user.id,
      periodMonth:String(formData.get("periodMonth")||""),
      notes:String(formData.get("notes")||"")||null,
    });
    refresh();
  } catch (error) {
    destination = `/finance/assets?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function postDepreciationRunAction(formData: FormData) {
  const access = await requirePermission("ASSET_APPROVE");
  let destination = "/finance/assets?status=penyusutan-dicatat-ke-jurnal";
  try {
    await postDepreciationRun({ organizationId:access.organization.id, actorUserId:access.user.id, runId:String(formData.get("runId")||"") });
    refresh();
  } catch (error) {
    destination = `/finance/assets?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}
