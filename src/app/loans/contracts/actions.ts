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
}

function contractError(message?: string) {
  const value = String(message || "");
  if (value.includes("NOT_APPROVED")) return "not-approved";
  if (value.includes("ALREADY_EXISTS") || value.includes("duplicate") || value.includes("23505")) return "duplicate";
  if (value.includes("PRODUCT_SNAPSHOT_INVALID") || value.includes("SCHEDULE_INVALID")) return "schedule";
  if (value.includes("FORBIDDEN")) return "forbidden";
  return "save";
}

export async function createLoanContractAction(formData: FormData) {
  await requireAccess("LOAN_CONTRACT_MANAGE");
  const applicationId = text(formData, "application_id");
  const agreementDate = text(formData, "agreement_date");
  if (!applicationId || !/^\d{4}-\d{2}-\d{2}$/.test(agreementDate)) redirect("/loans/contracts?error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_contract", {
    p_application_id: applicationId,
    p_agreement_date: agreementDate,
  });
  if (error || !data) redirect(`/loans/contracts?error=${contractError(error?.message)}`);

  revalidatePath("/loans/contracts");
  revalidatePath(`/loans/applications/${applicationId}`);
  redirect(`/loans/contracts/${data}?status=created`);
}
