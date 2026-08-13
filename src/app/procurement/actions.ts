"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import {
  createPurchaseOrderFromRequest,
  createPurchaseRequest,
  createSupplier,
  decidePurchaseRequest,
  issuePurchaseOrder,
  postGoodsReceipt,
} from "@/lib/d1/procurement";

async function requirePermission(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

function intValue(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(String(value ?? ""));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function errorUrl(base: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `${base}?error=${encodeURIComponent(message.slice(0, 220))}`;
}

export async function createSupplierAction(formData: FormData) {
  const access = await requirePermission("SUPPLIER_MANAGE");
  let destination = "/procurement?status=supplier-created";
  try {
    await createSupplier({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      code: String(formData.get("code") || ""),
      name: String(formData.get("name") || ""),
      taxId: String(formData.get("taxId") || "") || null,
      contactName: String(formData.get("contactName") || "") || null,
      phone: String(formData.get("phone") || "") || null,
      email: String(formData.get("email") || "") || null,
      address: String(formData.get("address") || "") || null,
      paymentTermsDays: intValue(formData.get("paymentTermsDays"), 0),
    });
    revalidatePath("/procurement");
  } catch (error) {
    destination = errorUrl("/procurement", error);
  }
  redirect(destination);
}

export async function createPurchaseRequestAction(formData: FormData) {
  const access = await requirePermission("PURCHASE_CREATE");
  let destination = "/procurement?status=pr-submitted";
  try {
    const items = JSON.parse(String(formData.get("itemsJson") || "[]")) as Array<{
      productId: string;
      quantity: number;
      estimatedUnitCostAmount: number;
    }>;
    await createPurchaseRequest({
      organizationId: access.organization.id,
      unitId: access.units[0]?.id ?? null,
      actorUserId: access.user.id,
      preferredSupplierId: String(formData.get("preferredSupplierId") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      items,
    });
    revalidatePath("/procurement");
  } catch (error) {
    destination = errorUrl("/procurement", error);
  }
  redirect(destination);
}

export async function approvePurchaseRequestAction(formData: FormData) {
  const access = await requirePermission("PURCHASE_APPROVE");
  let destination = "/procurement?status=pr-approved";
  try {
    await decidePurchaseRequest({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      purchaseRequestId: String(formData.get("purchaseRequestId") || ""),
      decision: "APPROVE",
    });
    revalidatePath("/procurement");
  } catch (error) {
    destination = errorUrl("/procurement", error);
  }
  redirect(destination);
}

export async function rejectPurchaseRequestAction(formData: FormData) {
  const access = await requirePermission("PURCHASE_APPROVE");
  let destination = "/procurement?status=pr-rejected";
  try {
    await decidePurchaseRequest({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      purchaseRequestId: String(formData.get("purchaseRequestId") || ""),
      decision: "REJECT",
      reason: String(formData.get("reason") || ""),
    });
    revalidatePath("/procurement");
  } catch (error) {
    destination = errorUrl("/procurement", error);
  }
  redirect(destination);
}

export async function createPurchaseOrderAction(formData: FormData) {
  const access = await requirePermission("PO_MANAGE");
  let destination = "/procurement?status=po-created";
  try {
    const id = await createPurchaseOrderFromRequest({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      purchaseRequestId: String(formData.get("purchaseRequestId") || ""),
      supplierId: String(formData.get("supplierId") || ""),
      expectedDate: String(formData.get("expectedDate") || "") || null,
      notes: String(formData.get("notes") || "") || null,
    });
    revalidatePath("/procurement");
    destination = `/procurement/po/${id}?status=created`;
  } catch (error) {
    destination = errorUrl("/procurement", error);
  }
  redirect(destination);
}

export async function issuePurchaseOrderAction(formData: FormData) {
  const access = await requirePermission("PO_MANAGE");
  const id = String(formData.get("purchaseOrderId") || "");
  let destination = `/procurement/po/${id}?status=issued`;
  try {
    await issuePurchaseOrder({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      purchaseOrderId: id,
    });
    revalidatePath("/procurement");
    revalidatePath(`/procurement/po/${id}`);
  } catch (error) {
    destination = errorUrl(`/procurement/po/${id}`, error);
  }
  redirect(destination);
}

export async function postGoodsReceiptAction(formData: FormData) {
  const access = await requirePermission("RECEIVING_POST");
  const purchaseOrderId = String(formData.get("purchaseOrderId") || "");
  let destination = `/procurement/po/${purchaseOrderId}?status=received`;
  try {
    const lines = JSON.parse(String(formData.get("linesJson") || "[]")) as Array<{
      purchaseOrderItemId: string;
      quantityReceived: number;
      batchCode?: string | null;
      expiryDate?: string | null;
    }>;
    await postGoodsReceipt({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      purchaseOrderId,
      warehouseId: String(formData.get("warehouseId") || ""),
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
    revalidatePath("/procurement");
    revalidatePath(`/procurement/po/${purchaseOrderId}`);
    revalidatePath("/inventory");
    revalidatePath("/inventory/opname");
  } catch (error) {
    destination = errorUrl(`/procurement/po/${purchaseOrderId}`, error);
  }
  redirect(destination);
}
