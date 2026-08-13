"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { createProduct, ensureDefaultWarehouse, postOpeningStock } from "@/lib/d1/inventory";

function text(formData: FormData, key: string, max = 120) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function money(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replace(/[^0-9]/g, "");
  const value = Number(raw || "0");
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Nilai ${key} tidak valid.`);
  return value;
}

function positiveInt(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "0"));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Nilai ${key} harus lebih dari 0.`);
  return value;
}

async function requireInventoryManager() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("INVENTORY_VIEW")) redirect("/dashboard");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/inventory?error=forbidden");

  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");
  return access;
}

export async function createDefaultWarehouseAction() {
  const access = await requireInventoryManager();
  await ensureDefaultWarehouse({
    organizationId: access.organization.id,
    unitId: access.units[0]?.id ?? null,
  });
  revalidatePath("/inventory");
  revalidatePath("/teller");
  redirect("/inventory?status=warehouse-ready");
}

export async function createProductAction(formData: FormData) {
  const access = await requireInventoryManager();
  let destination = "/inventory?status=product-created";

  try {
    const sku = text(formData, "sku", 40).toUpperCase();
    const name = text(formData, "name", 120);
    const barcode = text(formData, "barcode", 60);
    const unitName = text(formData, "unitName", 20) || "pcs";
    const costAmount = money(formData, "costAmount");
    const sellAmount = money(formData, "sellAmount");
    const trackStock = formData.get("trackStock") === "on";
    const trackExpiry = formData.get("trackExpiry") === "on";

    if (!sku || !name) throw new Error("SKU dan nama produk wajib diisi.");
    if (sellAmount < costAmount) throw new Error("Harga jual di bawah harga pokok belum diizinkan pada fase ini.");

    await createProduct({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      sku,
      barcode: barcode || null,
      name,
      unitName,
      costAmount,
      sellAmount,
      trackStock,
      trackExpiry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat produk.";
    destination = `/inventory?error=${encodeURIComponent(message.slice(0, 160))}`;
  }

  revalidatePath("/inventory");
  revalidatePath("/teller");
  redirect(destination);
}

export async function postOpeningStockAction(formData: FormData) {
  const access = await requireInventoryManager();
  let destination = "/inventory?status=stock-posted";

  try {
    const warehouseId = text(formData, "warehouseId", 80);
    const productId = text(formData, "productId", 80);
    const quantity = positiveInt(formData, "quantity");
    const unitCostAmount = money(formData, "unitCostAmount");
    const batchCode = text(formData, "batchCode", 80);
    const expiryDate = text(formData, "expiryDate", 20);

    if (!warehouseId || !productId) throw new Error("Gudang dan produk wajib dipilih.");

    await postOpeningStock({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      warehouseId,
      productId,
      quantity,
      unitCostAmount,
      batchCode: batchCode || null,
      expiryDate: expiryDate || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal posting stok awal.";
    destination = `/inventory?error=${encodeURIComponent(message.slice(0, 160))}`;
  }

  revalidatePath("/inventory");
  revalidatePath("/teller");
  redirect(destination);
}
