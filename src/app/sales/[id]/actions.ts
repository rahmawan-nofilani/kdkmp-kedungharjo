"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { voidCashSaleControlled } from "@/lib/d1/pos-sale-void";

export async function voidSaleAction(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_VOID")) redirect("/dashboard");

  const saleId = String(formData.get("saleId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  let destination = `/sales/${encodeURIComponent(saleId)}`;

  try {
    const result = await voidCashSaleControlled({
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
    revalidatePath("/finance");
    revalidatePath("/finance/journals");
    destination += result.duplicate ? "?status=voided&duplicate=1" : "?status=voided";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Void belum dapat diproses.";
    destination += `?error=${encodeURIComponent(message.slice(0, 180))}`;
  }

  redirect(destination);
}
