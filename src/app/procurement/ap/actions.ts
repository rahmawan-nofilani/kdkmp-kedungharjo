"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import {
  createSupplierInvoice,
  runThreeWayMatch,
} from "@/lib/d1/procurement-ap";
import {
  approveSupplierInvoiceWithMapping,
  paySupplierInvoiceWithMapping,
} from "@/lib/d1/procurement-ap-runtime";

async function requirePermission(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

function errorDestination(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `/procurement/ap?error=${encodeURIComponent(message.slice(0, 220))}`;
}

export async function createSupplierInvoiceAction(formData: FormData) {
  const access = await requirePermission("INVOICE_CREATE");
  let destination = "/procurement/ap?status=invoice-created";
  try {
    const lines = JSON.parse(String(formData.get("linesJson") || "[]")) as Array<{
      purchaseOrderItemId: string;
      quantityBilled: number;
      unitCostAmount: number;
    }>;
    await createSupplierInvoice({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      purchaseOrderId: String(formData.get("purchaseOrderId") || ""),
      invoiceNumber: String(formData.get("invoiceNumber") || ""),
      invoiceDate: String(formData.get("invoiceDate") || ""),
      dueDate: String(formData.get("dueDate") || "") || null,
      lines,
    });
    revalidatePath("/procurement/ap");
    revalidatePath("/procurement");
  } catch (error) {
    destination = errorDestination(error);
  }
  redirect(destination);
}

export async function matchSupplierInvoiceAction(formData: FormData) {
  const access = await requirePermission("INVOICE_MATCH");
  let destination = "/procurement/ap?status=match-completed";
  try {
    const result = await runThreeWayMatch({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      invoiceId: String(formData.get("invoiceId") || ""),
    });
    revalidatePath("/procurement/ap");
    destination = result.match ? "/procurement/ap?status=match-pass" : "/procurement/ap?status=match-check";
  } catch (error) {
    destination = errorDestination(error);
  }
  redirect(destination);
}

export async function approveSupplierInvoiceAction(formData: FormData) {
  const access = await requirePermission("INVOICE_APPROVE");
  let destination = "/procurement/ap?status=invoice-approved";
  try {
    await approveSupplierInvoiceWithMapping({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      invoiceId: String(formData.get("invoiceId") || ""),
    });
    revalidatePath("/procurement/ap");
    revalidatePath("/finance");
  } catch (error) {
    destination = errorDestination(error);
  }
  redirect(destination);
}

export async function paySupplierInvoiceAction(formData: FormData) {
  const access = await requirePermission("AP_PAY");
  let destination = "/procurement/ap?status=payment-posted";
  try {
    const amount = Math.trunc(Number(String(formData.get("amount") || "0")));
    const method = String(formData.get("method") || "BANK_TRANSFER") === "CASH" ? "CASH" : "BANK_TRANSFER";
    await paySupplierInvoiceWithMapping({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      invoiceId: String(formData.get("invoiceId") || ""),
      amount,
      method,
      referenceNumber: String(formData.get("referenceNumber") || "") || null,
    });
    revalidatePath("/procurement/ap");
    revalidatePath("/finance");
    revalidatePath("/dashboard");
  } catch (error) {
    destination = errorDestination(error);
  }
  redirect(destination);
}
