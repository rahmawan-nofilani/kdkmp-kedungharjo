"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";

const eventCodePattern = /^[A-Z][A-Z0-9_]{2,59}$/;
const productCodePattern = /^[A-Z][A-Z0-9_-]{1,39}$/;
const frequencyValues = new Set(["WEEKLY", "BIWEEKLY", "MONTHLY"]);
const interestMethodValues = new Set(["FLAT", "EFFECTIVE", "ANNUITY"]);

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function integer(formData: FormData, key: string, nullable: true): number | null;
function integer(formData: FormData, key: string, nullable?: false): number;
function integer(formData: FormData, key: string, nullable = false): number | null {
  const raw = text(formData, key);
  if (!raw && nullable) return null;
  const value = Number(raw.replace(/[^0-9-]/g, ""));
  if (!Number.isFinite(value)) return nullable ? null : 0;
  const normalized = Math.max(0, Math.trunc(value));
  if (!Number.isSafeInteger(normalized)) return nullable ? null : 0;
  return normalized;
}

function percentBps(formData: FormData, key: string, nullable: true): number | null;
function percentBps(formData: FormData, key: string, nullable?: false): number;
function percentBps(formData: FormData, key: string, nullable = false): number | null {
  const raw = text(formData, key).replace(",", ".");
  if (!raw && nullable) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return nullable ? null : 0;
  return Math.max(0, Math.round(value * 100));
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true" || formData.get(key) === "1";
}

function accountingEventCode(formData: FormData, key: string, fallback: string) {
  const value = (text(formData, key) || fallback).toUpperCase();
  return eventCodePattern.test(value) ? value : null;
}

async function requireAccess(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

export async function createLoanProductAction(formData: FormData) {
  const access = await requireAccess("LOAN_PRODUCT_MANAGE");
  const code = text(formData, "code").toUpperCase();
  const displayName = text(formData, "display_name");
  const description = text(formData, "description") || null;
  if (!productCodePattern.test(code) || displayName.length < 3 || displayName.length > 120) redirect("/loans/products?error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_product_with_version", {
    p_organization_id: access.organization.id,
    p_code: code,
    p_display_name: displayName,
    p_description: description,
  });
  if (error || !data) {
    const duplicate = error?.message?.toLowerCase().includes("duplicate") || error?.code === "23505";
    redirect(`/loans/products?error=${duplicate ? "duplicate" : "save"}`);
  }
  revalidatePath("/loans/products");
  redirect(`/loans/products/${data}?status=created`);
}

export async function updateLoanDraftAction(formData: FormData) {
  const access = await requireAccess("LOAN_PRODUCT_MANAGE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const displayName = text(formData, "display_name");
  const minPrincipal = integer(formData, "min_principal_amount");
  const maxPrincipal = integer(formData, "max_principal_amount", true);
  const minTenor = integer(formData, "min_tenor_months");
  const maxTenor = integer(formData, "max_tenor_months");
  const interestRateBps = percentBps(formData, "interest_rate_percent");
  const provisionFeeBps = percentBps(formData, "provision_fee_percent");
  const latePenaltyBps = percentBps(formData, "late_penalty_percent_per_day");
  const maxDsrBps = percentBps(formData, "max_dsr_percent");
  const maxActiveLoans = integer(formData, "max_active_loans");
  const installmentFrequency = text(formData, "installment_frequency").toUpperCase();
  const interestMethod = text(formData, "interest_method").toUpperCase();
  const disbursementEventCode = accountingEventCode(formData, "disbursement_accounting_event_code", "LOAN_DISBURSEMENT");
  const principalEventCode = accountingEventCode(formData, "principal_accounting_event_code", "LOAN_PRINCIPAL_REPAYMENT");
  const interestEventCode = accountingEventCode(formData, "interest_accounting_event_code", "LOAN_INTEREST_REPAYMENT");
  const penaltyEventCode = accountingEventCode(formData, "penalty_accounting_event_code", "LOAN_LATE_PENALTY");
  const invalid = !productId || !versionId || displayName.length < 3 || displayName.length > 120 || minPrincipal <= 0 || maxPrincipal === null || maxPrincipal < minPrincipal || minTenor < 1 || minTenor > 360 || maxTenor < minTenor || maxTenor > 360 || interestRateBps > 10000 || provisionFeeBps > 10000 || latePenaltyBps > 10000 || maxActiveLoans < 1 || maxActiveLoans > 10 || maxDsrBps < 1 || maxDsrBps > 10000 || !frequencyValues.has(installmentFrequency) || !interestMethodValues.has(interestMethod) || !disbursementEventCode || !principalEventCode || !interestEventCode || !penaltyEventCode;
  if (invalid) redirect(`/loans/products/${productId}?error=invalid`);

  const repaymentChannels = [
    checked(formData, "repayment_cash") ? "CASH" : null,
    checked(formData, "repayment_bank") ? "BANK_TRANSFER" : null,
    checked(formData, "repayment_qris") ? "QRIS" : null,
  ].filter(Boolean) as string[];
  const disbursementChannels = [
    checked(formData, "disbursement_cash") ? "CASH" : null,
    checked(formData, "disbursement_bank") ? "BANK_TRANSFER" : null,
  ].filter(Boolean) as string[];

  const payload = {
    display_name: displayName,
    description: text(formData, "description") || null,
    min_principal_amount: minPrincipal,
    max_principal_amount: maxPrincipal,
    min_tenor_months: minTenor,
    max_tenor_months: maxTenor,
    installment_frequency: installmentFrequency,
    interest_method: interestMethod,
    interest_rate_bps: interestRateBps,
    admin_fee_amount: integer(formData, "admin_fee_amount"),
    provision_fee_bps: provisionFeeBps,
    grace_period_days: integer(formData, "grace_period_days"),
    late_penalty_bps_per_day: latePenaltyBps,
    late_penalty_min_amount: integer(formData, "late_penalty_min_amount"),
    min_membership_months: integer(formData, "min_membership_months"),
    min_savings_balance_amount: integer(formData, "min_savings_balance_amount"),
    max_active_loans: maxActiveLoans,
    max_dsr_bps: maxDsrBps,
    collateral_required: checked(formData, "collateral_required"),
    guarantor_required: checked(formData, "guarantor_required"),
    repayment_channels: repaymentChannels.length ? repaymentChannels : ["CASH"],
    disbursement_channels: disbursementChannels.length ? disbursementChannels : ["CASH"],
    disbursement_accounting_event_code: disbursementEventCode,
    principal_accounting_event_code: principalEventCode,
    interest_accounting_event_code: interestEventCode,
    penalty_accounting_event_code: penaltyEventCode,
    regulatory_basis: text(formData, "regulatory_basis") || null,
    terms_text: text(formData, "terms_text") || null,
    effective_from: text(formData, "effective_from") || null,
    effective_to: text(formData, "effective_to") || null,
    change_note: text(formData, "change_note") || null,
  };

  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_product_versions").update(payload)
    .eq("id", versionId).eq("product_id", productId).eq("status", "DRAFT").select("id").maybeSingle();
  if (error || !data) redirect(`/loans/products/${productId}?error=save`);
  await supabase.from("loan_products").update({ updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", productId);
  revalidatePath(`/loans/products/${productId}`);
  revalidatePath("/loans/products");
  redirect(`/loans/products/${productId}?status=saved`);
}

export async function submitLoanVersionAction(formData: FormData) {
  const access = await requireAccess("LOAN_PRODUCT_MANAGE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_product_versions")
    .update({ status: "SUBMITTED", submitted_by: access.user.id, submitted_at: new Date().toISOString() })
    .eq("id", versionId).eq("product_id", productId).eq("status", "DRAFT").select("id").maybeSingle();
  if (error || !data) redirect(`/loans/products/${productId}?error=submit`);
  revalidatePath(`/loans/products/${productId}`);
  revalidatePath("/loans/products");
  revalidatePath("/approvals");
  redirect(`/loans/products/${productId}?status=submitted`);
}

export async function approveLoanVersionAction(formData: FormData) {
  await requireAccess("LOAN_PRODUCT_APPROVE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_loan_product_version", { p_version_id: versionId });
  if (error) redirect(`/loans/products/${productId}?error=${error.message.includes("LOAN_MAKER_CANNOT_APPROVE") ? "maker" : "approve"}`);
  revalidatePath(`/loans/products/${productId}`);
  revalidatePath("/loans/products");
  revalidatePath("/approvals");
  redirect(`/loans/products/${productId}?status=approved`);
}

export async function rejectLoanVersionAction(formData: FormData) {
  const access = await requireAccess("LOAN_PRODUCT_APPROVE");
  const productId = text(formData, "product_id");
  const versionId = text(formData, "version_id");
  const reason = text(formData, "rejection_reason");
  if (reason.length < 5) redirect(`/loans/products/${productId}?error=reason`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_product_versions")
    .update({ status: "REJECTED", rejected_by: access.user.id, rejected_at: new Date().toISOString(), rejection_reason: reason })
    .eq("id", versionId).eq("product_id", productId).eq("status", "SUBMITTED").select("id").maybeSingle();
  if (error || !data) redirect(`/loans/products/${productId}?error=reject`);
  revalidatePath(`/loans/products/${productId}`);
  revalidatePath("/loans/products");
  revalidatePath("/approvals");
  redirect(`/loans/products/${productId}?status=rejected`);
}

export async function createNextLoanVersionAction(formData: FormData) {
  const access = await requireAccess("LOAN_PRODUCT_MANAGE");
  const productId = text(formData, "product_id");
  const supabase = await createClient();
  const { data: versions, error: readError } = await supabase.from("loan_product_versions").select("*").eq("product_id", productId).order("version", { ascending: false });
  if (readError || !versions?.length) redirect(`/loans/products/${productId}?error=version`);
  if (versions.some((version) => version.status === "DRAFT" || version.status === "SUBMITTED")) redirect(`/loans/products/${productId}?error=open-version`);
  const source = versions.find((version) => version.status === "APPROVED") || versions[0];
  const nextVersion = Math.max(...versions.map((version) => Number(version.version))) + 1;
  const copyKeys = [
    "display_name", "description", "min_principal_amount", "max_principal_amount", "min_tenor_months", "max_tenor_months",
    "installment_frequency", "interest_method", "interest_rate_bps", "admin_fee_amount", "provision_fee_bps", "grace_period_days",
    "late_penalty_bps_per_day", "late_penalty_min_amount", "min_membership_months", "min_savings_balance_amount", "max_active_loans",
    "max_dsr_bps", "collateral_required", "guarantor_required", "repayment_channels", "disbursement_channels",
    "disbursement_accounting_event_code", "principal_accounting_event_code", "interest_accounting_event_code", "penalty_accounting_event_code",
    "regulatory_basis", "terms_text", "effective_from", "effective_to",
  ];
  const payload: Record<string, unknown> = { product_id: productId, version: nextVersion, status: "DRAFT", created_by: access.user.id, change_note: text(formData, "change_note") || null };
  for (const key of copyKeys) payload[key] = source[key];
  const { data, error } = await supabase.from("loan_product_versions").insert(payload).select("id").single();
  if (error || !data) redirect(`/loans/products/${productId}?error=version`);
  revalidatePath(`/loans/products/${productId}`);
  revalidatePath("/loans/products");
  redirect(`/loans/products/${productId}?status=new-version`);
}
