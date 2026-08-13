"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function requireAccess(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

function accountError(message?: string) {
  const value = String(message || "").toUpperCase();
  if (value.includes("ACCOUNT_ALREADY_EXISTS") || value.includes("DUPLICATE")) return "duplicate";
  if (value.includes("MEMBER_NOT_ACTIVE")) return "member";
  if (value.includes("PRODUCT_NOT_ACTIVE") || value.includes("APPROVED_VERSION_NOT_FOUND")) return "product";
  if (value.includes("PRODUCT_NOT_EFFECTIVE") || value.includes("PRODUCT_EXPIRED")) return "effective";
  if (value.includes("MAKER_CHECKER_REQUIRED")) return "maker";
  if (value.includes("REJECTION_REASON_REQUIRED")) return "reason";
  if (value.includes("FORBIDDEN")) return "forbidden";
  return "save";
}

export async function openSavingsAccountAction(formData: FormData) {
  await requireAccess("SAVINGS_ACCOUNT_OPEN");
  const memberId = text(formData, "member_id");
  const productId = text(formData, "product_id");
  if (!memberId || !productId) redirect("/savings/accounts?error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_savings_account", {
    p_member_id: memberId,
    p_product_id: productId,
  });
  if (error || !data) redirect(`/savings/accounts?error=${accountError(error?.message)}`);

  revalidatePath("/savings/accounts");
  revalidatePath("/approvals");
  redirect(`/savings/accounts?status=opened&account=${encodeURIComponent(String(data))}`);
}

export async function approveSavingsAccountAction(formData: FormData) {
  await requireAccess("SAVINGS_ACCOUNT_APPROVE");
  const accountId = text(formData, "account_id");
  if (!accountId) redirect("/savings/accounts?error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_accounts")
    .update({ status: "ACTIVE" })
    .eq("id", accountId)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(`/savings/accounts?error=${accountError(error?.message)}`);
  revalidatePath("/savings/accounts");
  revalidatePath("/approvals");
  redirect("/savings/accounts?status=approved");
}

export async function rejectSavingsAccountAction(formData: FormData) {
  await requireAccess("SAVINGS_ACCOUNT_APPROVE");
  const accountId = text(formData, "account_id");
  const reason = text(formData, "rejection_reason");
  if (!accountId || reason.length < 5) redirect("/savings/accounts?error=reason");

  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_accounts")
    .update({ status: "REJECTED", rejection_reason: reason })
    .eq("id", accountId)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(`/savings/accounts?error=${accountError(error?.message)}`);
  revalidatePath("/savings/accounts");
  revalidatePath("/approvals");
  redirect("/savings/accounts?status=rejected");
}
