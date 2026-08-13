"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getOpenShift } from "@/lib/d1/teller";
import { commitCashSale, getPrimaryWarehouse } from "@/lib/d1/pos";
import { createClient } from "@/lib/supabase/server";

type SubmittedItem = {
  productId?: unknown;
  quantity?: unknown;
};

export type CashSaleActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  saleId?: string;
  receiptNumber?: string;
  totalAmount?: number;
  duplicate?: boolean;
};

export const initialCashSaleState: CashSaleActionState = { status: "idle" };

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

export async function commitCashSaleAction(
  _previousState: CashSaleActionState,
  formData: FormData,
): Promise<CashSaleActionState> {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS")) redirect("/dashboard");

  try {
    const [shift, warehouse] = await Promise.all([
      getOpenShift(access.organization.id, access.user.id),
      getPrimaryWarehouse(access.organization.id),
    ]);

    if (!shift) throw new Error("Tidak ada shift OPEN. Buka shift teller terlebih dahulu.");
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

    revalidatePath("/inventory");
    revalidatePath("/teller");
    revalidatePath("/reports/daily-sales");

    return {
      status: "success",
      saleId: result.saleId,
      receiptNumber: result.receiptNumber,
      totalAmount: result.totalAmount,
      duplicate: result.duplicate,
      message: result.duplicate ? "Transaksi duplikat dicegah." : "Transaksi berhasil diposting.",
    };
  } catch (error) {
    return {
      status: "error",
      message: safeMessage(error),
    };
  }
}
