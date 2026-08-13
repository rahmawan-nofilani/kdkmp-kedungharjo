"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift } from "@/lib/d1/teller";
import { commitCashSale, getPrimaryWarehouse } from "@/lib/d1/pos";
import { createClient } from "@/lib/supabase/server";

type SubmittedItem = {
  productId?: unknown;
  quantity?: unknown;
};

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Transaksi belum dapat diproses.").slice(0, 180);
}

function parseItems(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Keranjang transaksi tidak dapat dibaca.");
  }
  if (!Array.isArray(parsed)) throw new Error("Format keranjang transaksi tidak valid.");

  return parsed.map((value) => {
    const item = value as SubmittedItem;
    return {
      productId: String(item.productId ?? ""),
      quantity: Number(item.quantity),
    };
  });
}

export async function commitCashSaleAction(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS")) redirect("/dashboard");

  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");

  let destination = "/pos";

  try {
    const shift = await getOpenShift(access.organization.id, access.user.id);
    if (!shift) throw new Error("Tidak ada shift OPEN. Buka shift teller terlebih dahulu.");

    const warehouse = await getPrimaryWarehouse(access.organization.id);
    if (!warehouse) throw new Error("Gudang aktif belum tersedia.");

    const memberId = String(formData.get("memberId") ?? "").trim() || null;
    if (memberId) {
      const supabase = await createClient();
      const { data: member } = await supabase
        .from("members")
        .select("id")
        .eq("organization_id", access.organization.id)
        .eq("id", memberId)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (!member) throw new Error("Anggota tidak ditemukan atau tidak aktif.");
    }

    const items = parseItems(String(formData.get("itemsJson") ?? "[]"));
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

    const result = await commitCashSale({
      organizationId: access.organization.id,
      unitId: access.units[0]?.id ?? null,
      tellerUserId: access.user.id,
      shiftId: shift.id,
      warehouseId: warehouse.id,
      memberId,
      idempotencyKey,
      items,
    });

    revalidatePath("/pos");
    revalidatePath("/inventory");
    revalidatePath("/teller");
    destination = `/pos?status=success&receipt=${encodeURIComponent(result.receiptNumber)}&total=${result.totalAmount}${result.duplicate ? "&duplicate=1" : ""}`;
  } catch (error) {
    destination = `/pos?error=${encodeURIComponent(safeMessage(error))}`;
  }

  redirect(destination);
}
