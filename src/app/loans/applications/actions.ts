"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getSavingsBalances } from "@/lib/d1/savings-ledger";
import { evaluateLoanEligibility, membershipMonthsSince, type LoanProductEligibilityConfig } from "@/lib/loans/eligibility";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function integer(formData: FormData, key: string) {
  const raw = text(formData, key).replace(/[^0-9-]/g, "");
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

async function requireAccess(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

function revalidateLoanPaths(applicationId?: string) {
  revalidatePath("/loans/applications");
  revalidatePath("/approvals");
  if (applicationId) revalidatePath(`/loans/applications/${applicationId}`);
}

function applicationError(message: string | undefined) {
  const value = String(message || "");
  if (value.includes("ACTIVE_LIMIT")) return "active-limit";
  if (value.includes("NOT_ELIGIBLE")) return "not-eligible";
  if (value.includes("MAKER_CANNOT")) return "maker";
  if (value.includes("REJECTION_REASON")) return "reason";
  if (value.includes("duplicate") || value.includes("23505")) return "duplicate";
  return "save";
}

export async function createLoanApplicationAction(formData: FormData) {
  const access = await requireAccess("LOAN_APPLICATION_MANAGE");
  const memberId = text(formData, "member_id");
  const productVersionId = text(formData, "product_version_id");
  const principal = integer(formData, "requested_principal_amount");
  const tenor = integer(formData, "requested_tenor_months");
  const purpose = text(formData, "purpose");
  const income = integer(formData, "declared_monthly_income_amount");
  const obligation = integer(formData, "declared_monthly_obligation_amount");
  if (!memberId || !productVersionId || principal <= 0 || tenor < 1 || tenor > 360 || purpose.length < 5 || purpose.length > 500 || income <= 0) {
    redirect("/loans/applications?error=invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_application", {
    p_organization_id: access.organization.id,
    p_member_id: memberId,
    p_product_version_id: productVersionId,
    p_requested_principal_amount: principal,
    p_requested_tenor_months: tenor,
    p_purpose: purpose,
    p_declared_monthly_income_amount: income,
    p_declared_monthly_obligation_amount: obligation,
    p_collateral_note: optionalText(formData, "collateral_note"),
    p_guarantor_note: optionalText(formData, "guarantor_note"),
  });
  if (error || !data) redirect(`/loans/applications?error=${applicationError(error?.message)}`);
  revalidateLoanPaths(String(data));
  redirect(`/loans/applications/${data}?status=created`);
}

export async function evaluateLoanApplicationAction(formData: FormData) {
  const access = await requireAccess("LOAN_APPLICATION_MANAGE");
  const applicationId = text(formData, "application_id");
  const supabase = await createClient();
  const { data: application, error: applicationReadError } = await supabase.from("loan_applications")
    .select("id,organization_id,member_id,product_id,product_version_id,status,requested_principal_amount,requested_tenor_months,declared_monthly_income_amount,declared_monthly_obligation_amount,collateral_note,guarantor_note")
    .eq("id", applicationId).eq("organization_id", access.organization.id).eq("status", "DRAFT").maybeSingle();
  if (applicationReadError || !application) redirect(`/loans/applications/${applicationId}?error=not-draft`);

  const [memberResult, productResult, accountResult, commitmentResult, schema] = await Promise.all([
    supabase.from("members").select("id,status,member_since").eq("id", application.member_id).eq("organization_id", access.organization.id).maybeSingle(),
    supabase.from("loan_product_versions").select("*,loan_products!inner(id,organization_id,code,status,current_approved_version)").eq("id", application.product_version_id).eq("loan_products.organization_id", access.organization.id).maybeSingle(),
    supabase.from("savings_accounts").select("id").eq("organization_id", access.organization.id).eq("member_id", application.member_id).eq("status", "ACTIVE"),
    supabase.from("loan_applications").select("id").eq("organization_id", access.organization.id).eq("member_id", application.member_id).neq("id", application.id).in("status", ["SUBMITTED", "UNDER_REVIEW", "APPROVED"]),
    getD1SchemaStatus(),
  ]);
  if (memberResult.error || !memberResult.data || productResult.error || !productResult.data || accountResult.error || commitmentResult.error) {
    redirect(`/loans/applications/${applicationId}?error=source`);
  }

  const productRelation = (productResult.data as Record<string, unknown>).loan_products;
  const product = (Array.isArray(productRelation) ? productRelation[0] : productRelation) as Record<string, unknown> | null;
  if (!product) redirect(`/loans/applications/${applicationId}?error=source`);
  const observedAt = new Date().toISOString();
  const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(observedAt));
  let d1Current = schema.current && schema.currentVersion === "savings_ledger_v11" && schema.features.savingsLedger;
  let savingsBalance = 0;
  if (d1Current) {
    try {
      const balances = await getSavingsBalances(access.organization.id, (accountResult.data ?? []).map((account) => account.id));
      savingsBalance = Array.from(balances.values()).reduce((sum, balance) => sum + balance, 0);
    } catch {
      savingsBalance = 0;
      d1Current = false;
    }
  }

  const productVersion = productResult.data as unknown as LoanProductEligibilityConfig;
  const result = evaluateLoanEligibility({
    applicationId,
    principalAmount: Number(application.requested_principal_amount),
    tenorMonths: Number(application.requested_tenor_months),
    monthlyIncomeAmount: Number(application.declared_monthly_income_amount),
    monthlyObligationAmount: Number(application.declared_monthly_obligation_amount),
    collateralNote: application.collateral_note,
    guarantorNote: application.guarantor_note,
    memberStatus: memberResult.data.status,
    membershipMonths: membershipMonthsSince(memberResult.data.member_since, observedAt),
    savingsBalanceAmount: savingsBalance,
    openCommitments: commitmentResult.data?.length ?? 0,
    d1Current,
    observedAt,
    jakartaDate,
    productCode: String(product.code || "PRODUK"),
    productStatus: String(product.status || "UNKNOWN"),
    currentApprovedVersion: Number(product.current_approved_version || 0),
    product: productVersion,
  });

  const { data: updated, error } = await supabase.from("loan_applications").update({
    eligibility_status: result.status,
    product_snapshot: result.productSnapshot,
    eligibility_snapshot: result.eligibilitySnapshot,
    eligibility_checked_at: observedAt,
    projected_installment_amount: result.projectedInstallmentAmount,
    projected_monthly_commitment_amount: result.projectedMonthlyCommitmentAmount,
    calculated_dsr_bps: result.calculatedDsrBps,
    updated_by: access.user.id,
  }).eq("id", applicationId).eq("organization_id", access.organization.id).eq("status", "DRAFT").select("id").maybeSingle();
  if (error || !updated) redirect(`/loans/applications/${applicationId}?error=${applicationError(error?.message)}`);
  revalidateLoanPaths(applicationId);
  redirect(`/loans/applications/${applicationId}?status=checked`);
}

export async function submitLoanApplicationAction(formData: FormData) {
  const access = await requireAccess("LOAN_APPLICATION_MANAGE");
  const applicationId = text(formData, "application_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_applications")
    .update({ status: "SUBMITTED", updated_by: access.user.id })
    .eq("id", applicationId).eq("organization_id", access.organization.id).eq("status", "DRAFT").eq("eligibility_status", "PASS")
    .select("id").maybeSingle();
  if (error || !data) redirect(`/loans/applications/${applicationId}?error=${applicationError(error?.message || "NOT_ELIGIBLE")}`);
  revalidateLoanPaths(applicationId);
  redirect(`/loans/applications/${applicationId}?status=submitted`);
}

export async function cancelLoanApplicationAction(formData: FormData) {
  const access = await requireAccess("LOAN_APPLICATION_MANAGE");
  const applicationId = text(formData, "application_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_applications").update({ status: "CANCELLED", updated_by: access.user.id })
    .eq("id", applicationId).eq("organization_id", access.organization.id).eq("status", "DRAFT").select("id").maybeSingle();
  if (error || !data) redirect(`/loans/applications/${applicationId}?error=save`);
  revalidateLoanPaths(applicationId);
  redirect(`/loans/applications/${applicationId}?status=cancelled`);
}

export async function startLoanApplicationReviewAction(formData: FormData) {
  await requireAccess("LOAN_APPLICATION_APPROVE");
  const applicationId = text(formData, "application_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_loan_application_review", { p_application_id: applicationId });
  if (error) redirect(`/loans/applications/${applicationId}?error=${applicationError(error.message)}`);
  revalidateLoanPaths(applicationId);
  redirect(`/loans/applications/${applicationId}?status=reviewing`);
}

export async function decideLoanApplicationAction(formData: FormData) {
  await requireAccess("LOAN_APPLICATION_APPROVE");
  const applicationId = text(formData, "application_id");
  const decision = text(formData, "decision").toUpperCase();
  const note = optionalText(formData, "decision_note");
  if (!new Set(["APPROVE", "REJECT"]).has(decision) || (decision === "REJECT" && String(note || "").length < 5)) {
    redirect(`/loans/applications/${applicationId}?error=reason`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_loan_application", { p_application_id: applicationId, p_decision: decision, p_note: note });
  if (error) redirect(`/loans/applications/${applicationId}?error=${applicationError(error.message)}`);
  revalidateLoanPaths(applicationId);
  redirect(`/loans/applications/${applicationId}?status=${decision === "APPROVE" ? "approved" : "rejected"}`);
}
