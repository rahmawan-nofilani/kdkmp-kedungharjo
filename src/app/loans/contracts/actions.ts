"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { buildLoanSchedule, type LoanInstallmentFrequency, type LoanInterestMethod } from "@/lib/loans/schedule";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requireAccess(permission: string) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

function contractError(message?: string) {
  const value = String(message || "");
  if (value.includes("NOT_APPROVED")) return "not-approved";
  if (value.includes("ALREADY_EXISTS") || value.includes("duplicate") || value.includes("23505")) return "duplicate";
  if (value.includes("SCHEDULE_INVALID")) return "schedule";
  if (value.includes("FORBIDDEN")) return "forbidden";
  return "save";
}

export async function createLoanContractAction(formData: FormData) {
  const access = await requireAccess("LOAN_CONTRACT_MANAGE");
  const applicationId = text(formData, "application_id");
  const agreementDate = text(formData, "agreement_date");
  if (!applicationId || !/^\d{4}-\d{2}-\d{2}$/.test(agreementDate)) redirect("/loans/contracts?error=invalid");

  const supabase = await createClient();
  const { data: application, error: applicationError } = await supabase.from("loan_applications")
    .select("id,organization_id,status,member_id,product_id,product_version_id,requested_principal_amount,requested_tenor_months,product_snapshot")
    .eq("id", applicationId)
    .eq("organization_id", access.organization.id)
    .eq("status", "APPROVED")
    .maybeSingle();
  if (applicationError || !application) redirect("/loans/contracts?error=not-approved");

  const snapshot = object(application.product_snapshot);
  const frequency = String(snapshot.installment_frequency || "") as LoanInstallmentFrequency;
  const method = String(snapshot.interest_method || "") as LoanInterestMethod;
  const rate = Number(snapshot.interest_rate_bps || 0);
  const adminFee = Number(snapshot.admin_fee_amount || 0);
  const provisionFeeBps = Number(snapshot.provision_fee_bps || 0);
  if (!["WEEKLY", "BIWEEKLY", "MONTHLY"].includes(frequency) || !["FLAT", "EFFECTIVE", "ANNUITY"].includes(method)) {
    redirect("/loans/contracts?error=snapshot");
  }

  let schedule;
  try {
    schedule = buildLoanSchedule({
      principalAmount: Number(application.requested_principal_amount),
      tenorMonths: Number(application.requested_tenor_months),
      installmentFrequency: frequency,
      interestMethod: method,
      interestRateBps: rate,
      referenceDate: agreementDate,
      adminFeeAmount: adminFee,
      provisionFeeBps,
    });
  } catch {
    redirect("/loans/contracts?error=schedule");
  }

  const { data, error } = await supabase.rpc("create_loan_contract", {
    p_application_id: applicationId,
    p_agreement_date: agreementDate,
    p_schedule_snapshot: {
      schema_version: schedule.schemaVersion,
      periods: schedule.periods,
      periods_per_year: schedule.periodsPerYear,
      first_due_date: schedule.firstDueDate,
      principal_amount: schedule.principalAmount,
      total_principal_amount: schedule.totalPrincipalAmount,
      total_interest_amount: schedule.totalInterestAmount,
      total_installment_amount: schedule.totalInstallmentAmount,
      admin_fee_amount: schedule.adminFeeAmount,
      provision_fee_amount: schedule.provisionFeeAmount,
      total_upfront_fee_amount: schedule.totalUpfrontFeeAmount,
      rows: schedule.rows.map((row) => ({
        installment_number: row.period,
        due_date: row.dueDate,
        opening_principal_amount: row.openingPrincipalAmount,
        principal_amount: row.principalAmount,
        interest_amount: row.interestAmount,
        installment_amount: row.installmentAmount,
        closing_principal_amount: row.closingPrincipalAmount,
      })),
    },
  });
  if (error || !data) redirect(`/loans/contracts?error=${contractError(error?.message)}`);

  revalidatePath("/loans/contracts");
  revalidatePath(`/loans/applications/${applicationId}`);
  redirect(`/loans/contracts/${data}?status=created`);
}
