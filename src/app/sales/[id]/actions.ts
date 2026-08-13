"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { voidCashSale } from "@/lib/d1/sales";

export async function voidSaleAction(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");

  const saleId = String(formData.get("saleId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  let destination = `/sales/${encodeURIComponent(saleId)}`;

  try {
    await voidCashSale({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      saleId,
      reason,
    });
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/pos");
    revalidatePath("/inventory");
    revalidatePath("/teller");
    revalidatePath("/reports/daily-sales");
    destination += "?status=voided";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Void belum dapat diproses.";
    destination += `?error=${encodeURIComponent(message.slice(0, 180))}`;
  }

  redirect(destination);
}
