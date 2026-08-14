"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function integer(formData: FormData, key: string, nullable = false) {
  const raw = text(formData, key);
  if (!raw && nullable) return null;
  const value = Number(raw.replace(/[^0-9-]/g, ""));
  if (!Number.isFinite(value)) return nullable ? null : 0;
  return Math.max(0, Math.trunc(value));
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true" || formData.get(key) === "1";
}

function accountingEventCode(formData: FormData, key: string, fallback: string) {
  const value = (text(formData, key) || fallback).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,59}$/.test(value)) return null;
  return value;
}

async function requireAccess(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

export async function createSavingsProductAction(formData: FormData) {
  const access = await requireAccess("SAVINGS_PRODUCT_MANAGE");
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "display_name");
  const description = text(formData, "description") || null;
  if (code.length < 2 || name.length < 3) redirect("/savings/products?error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_savings_product_with_version", {
    p_organization_id: access.organization.id,
    p_code: code,
    p_display_name: name,
    p_description: description,
  });
  if (error || !data) {
    const duplicate = error?.message?.toLowerCase().includes("duplicate") || error?.code === "23505";
    redirect(`/savings/products?error=${duplicate ? "duplicate" : "save"}`);
  }
  revalidatePath("/savings/products");
  redirect(`/savings/products/${data}?status=created`);
}

export async function updateSavingsDraftAction(formData: FormData) {
  const access = await requireAccess("SAVINGS_PRODUCT_MANAGE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const displayName = text(formData, "display_name");
  const depositEventCode = accountingEventCode(formData, "deposit_accounting_event_code", "SAVINGS_DEPOSIT");
  const withdrawalEventCode = accountingEventCode(formData, "withdrawal_accounting_event_code", "SAVINGS_WITHDRAWAL");
  if (!productId || !versionId || displayName.length < 3 || !depositEventCode || !withdrawalEventCode) redirect(`/savings/products/${productId}?error=invalid`);

  const maxBalance = integer(formData, "max_balance_amount", true);
  const recurringRequired = checked(formData, "recurring_required");
  const recurringAmount = recurringRequired ? integer(formData, "recurring_amount", true) : null;
  const paymentChannels = [
    checked(formData, "channel_cash") ? "CASH" : null,
    checked(formData, "channel_bank") ? "BANK_TRANSFER" : null,
    checked(formData, "channel_qris") ? "QRIS" : null,
  ].filter(Boolean) as string[];

  const payload = {
    display_name: displayName,
    description: text(formData, "description") || null,
    deposit_enabled: checked(formData, "deposit_enabled"),
    withdrawal_enabled: checked(formData, "withdrawal_enabled"),
    allow_pos_spend: checked(formData, "allow_pos_spend"),
    min_opening_amount: integer(formData, "min_opening_amount"),
    min_deposit_amount: integer(formData, "min_deposit_amount"),
    min_withdrawal_amount: integer(formData, "min_withdrawal_amount"),
    min_balance_amount: integer(formData, "min_balance_amount"),
    max_balance_amount: maxBalance,
    lock_days: integer(formData, "lock_days"),
    maturity_days: integer(formData, "maturity_days", true),
    target_amount: integer(formData, "target_amount", true),
    recurring_required: recurringRequired,
    recurring_amount: recurringAmount,
    recurring_frequency: recurringRequired ? text(formData, "recurring_frequency") || null : null,
    early_withdrawal_allowed: checked(formData, "early_withdrawal_allowed"),
    payment_channels: paymentChannels.length ? paymentChannels : ["CASH"],
    deposit_accounting_event_code: depositEventCode,
    withdrawal_accounting_event_code: withdrawalEventCode,
    regulatory_basis: text(formData, "regulatory_basis") || null,
    terms_text: text(formData, "terms_text") || null,
    effective_from: text(formData, "effective_from") || null,
    effective_to: text(formData, "effective_to") || null,
    change_note: text(formData, "change_note") || null,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("savings_product_versions")
    .update(payload)
    .eq("id", versionId)
    .eq("product_id", productId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/savings/products/${productId}?error=save`);

  await supabase.from("savings_products").update({ updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", productId);
  revalidatePath(`/savings/products/${productId}`);
  revalidatePath("/savings/products");
  redirect(`/savings/products/${productId}?status=saved`);
}

export async function submitSavingsVersionAction(formData: FormData) {
  const access = await requireAccess("SAVINGS_PRODUCT_MANAGE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("savings_product_versions")
    .update({ status: "SUBMITTED", submitted_by: access.user.id, submitted_at: now })
    .eq("id", versionId).eq("product_id", productId).eq("status", "DRAFT")
    .select("id").maybeSingle();
  if (error || !data) redirect(`/savings/products/${productId}?error=submit`);
  revalidatePath(`/savings/products/${productId}`);
  revalidatePath("/savings/products");
  revalidatePath("/approvals");
  redirect(`/savings/products/${productId}?status=submitted`);
}

export async function approveSavingsVersionAction(formData: FormData) {
  await requireAccess("SAVINGS_PRODUCT_APPROVE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_savings_product_version", { p_version_id: versionId });
  if (error) {
    const maker = error.message.includes("SAVINGS_MAKER_CANNOT_APPROVE");
    redirect(`/savings/products/${productId}?error=${maker ? "maker" : "approve"}`);
  }
  revalidatePath(`/savings/products/${productId}`);
  revalidatePath("/savings/products");
  revalidatePath("/approvals");
  redirect(`/savings/products/${productId}?status=approved`);
}

export async function rejectSavingsVersionAction(formData: FormData) {
  const access = await requireAccess("SAVINGS_PRODUCT_APPROVE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const reason = text(formData, "rejection_reason");
  if (reason.length < 5) redirect(`/savings/products/${productId}?error=reason`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("savings_product_versions")
    .update({ status: "REJECTED", rejected_by: access.user.id, rejected_at: new Date().toISOString(), rejection_reason: reason })
    .eq("id", versionId).eq("product_id", productId).eq("status", "SUBMITTED")
    .select("id").maybeSingle();
  if (error || !data) redirect(`/savings/products/${productId}?error=reject`);
  revalidatePath(`/savings/products/${productId}`);
  revalidatePath("/savings/products");
  revalidatePath("/approvals");
  redirect(`/savings/products/${productId}?status=rejected`);
}

export async function createNextSavingsVersionAction(formData: FormData) {
  const access = await requireAccess("SAVINGS_PRODUCT_MANAGE");
  const productId = text(formData, "product_id");
  const changeNote = text(formData, "change_note") || null;
  const supabase = await createClient();

  const { data: versions, error: readError } = await supabase.from("savings_product_versions")
    .select("*").eq("product_id", productId).order("version", { ascending: false });
  if (readError || !versions?.length) redirect(`/savings/products/${productId}?error=version`);
  if (versions.some((version) => version.status === "DRAFT" || version.status === "SUBMITTED")) redirect(`/savings/products/${productId}?error=open-version`);
  const source = versions.find((version) => version.status === "APPROVED") || versions[0];
  const nextVersion = Math.max(...versions.map((version) => Number(version.version))) + 1;
  const copyKeys = [
    "display_name","description","deposit_enabled","withdrawal_enabled","allow_pos_spend","min_opening_amount","min_deposit_amount",
    "min_withdrawal_amount","min_balance_amount","max_balance_amount","lock_days","maturity_days","target_amount","recurring_required",
    "recurring_amount","recurring_frequency","early_withdrawal_allowed","eligibility_rules","payment_channels","deposit_accounting_event_code",
    "withdrawal_accounting_event_code","regulatory_basis","terms_text","effective_from","effective_to",
  ];
  const payload: Record<string, unknown> = { product_id: productId, version: nextVersion, status: "DRAFT", created_by: access.user.id, change_note: changeNote };
  for (const key of copyKeys) payload[key] = source[key];
  const { data, error } = await supabase.from("savings_product_versions").insert(payload).select("id").single();
  if (error || !data) redirect(`/savings/products/${productId}?error=version`);
  revalidatePath(`/savings/products/${productId}`);
  revalidatePath("/savings/products");
  redirect(`/savings/products/${productId}?status=new-version`);
}
