"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { postLoanDisbursement, type LoanDisbursementChannel } from "@/lib/d1/loan-disbursement";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
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

function refresh(disbursementId?: string, contractId?: string) {
  revalidatePath("/loans/disbursements");
  revalidatePath("/loans/contracts");
  revalidatePath("/approvals");
  revalidatePath("/finance");
  revalidatePath("/finance/treasury");
  if (disbursementId) revalidatePath(`/loans/disbursements/${disbursementId}`);
  if (contractId) revalidatePath(`/loans/contracts/${contractId}`);
}

function rpcError(message?: string) {
  const value = String(message || "");
  if (value.includes("CONTRACT_NOT_READY")) return "contract";
  if (value.includes("ALREADY_EXISTS") || value.includes("duplicate") || value.includes("23505")) return "duplicate";
  if (value.includes("CHANNEL_INVALID")) return "channel";
  if (value.includes("PRODUCT_SNAPSHOT_INVALID")) return "snapshot";
  if (value.includes("BANK_DESTINATION_REQUIRED")) return "bank";
  if (value.includes("MAKER_CANNOT_APPROVE")) return "maker";
  if (value.includes("REJECTION_REASON_REQUIRED")) return "reason";
  if (value.includes("REFERENCE_MISMATCH")) return "reference-mismatch";
  if (value.includes("FORBIDDEN")) return "forbidden";
  return "save";
}

export async function createLoanDisbursementAction(formData: FormData) {
  const access = await requireAccess("LOAN_DISBURSEMENT_MANAGE");
  const contractId = text(formData, "contract_id");
  const channel = text(formData, "channel").toUpperCase() as LoanDisbursementChannel;
  const treasuryAccountId = text(formData, "treasury_account_id");
  const recipientName = text(formData, "recipient_name");
  const bankName = optionalText(formData, "bank_name");
  const bankAccountNumber = optionalText(formData, "bank_account_number");
  if (!contractId || !["CASH", "BANK_TRANSFER"].includes(channel) || !treasuryAccountId || recipientName.length < 3) {
    redirect("/loans/disbursements?error=invalid");
  }

  const schema = await getD1SchemaStatus();
  if (!schema.current || !schema.features.treasuryPeriod) redirect("/loans/disbursements?error=d1");
  let treasury;
  try {
    const accounts = await listTreasuryAccounts(access.organization.id);
    treasury = accounts.find((row) => row.id === treasuryAccountId && row.status === "ACTIVE");
  } catch {
    redirect("/loans/disbursements?error=d1");
  }
  const expectedType = channel === "CASH" ? "CASH" : "BANK";
  if (!treasury || treasury.account_type !== expectedType) redirect("/loans/disbursements?error=treasury");
  if (channel === "BANK_TRANSFER" && (!bankName || !bankAccountNumber || bankAccountNumber.length < 4)) redirect("/loans/disbursements?error=bank");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_disbursement", {
    p_contract_id: contractId,
    p_channel: channel,
    p_treasury_account_id: treasuryAccountId,
    p_recipient_name: recipientName,
    p_bank_name: channel === "BANK_TRANSFER" ? bankName : null,
    p_bank_account_number: channel === "BANK_TRANSFER" ? bankAccountNumber : null,
    p_note: optionalText(formData, "request_note"),
  });
  if (error || !data) redirect(`/loans/disbursements?error=${rpcError(error?.message)}`);
  refresh(String(data), contractId);
  redirect(`/loans/disbursements/${data}?status=created`);
}

export async function submitLoanDisbursementAction(formData: FormData) {
  await requireAccess("LOAN_DISBURSEMENT_MANAGE");
  const id = text(formData, "disbursement_id");
  const contractId = text(formData, "contract_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_loan_disbursement", { p_disbursement_id: id });
  if (error) redirect(`/loans/disbursements/${id}?error=${rpcError(error.message)}`);
  refresh(id, contractId);
  redirect(`/loans/disbursements/${id}?status=submitted`);
}

export async function cancelLoanDisbursementAction(formData: FormData) {
  await requireAccess("LOAN_DISBURSEMENT_MANAGE");
  const id = text(formData, "disbursement_id");
  const contractId = text(formData, "contract_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_loan_disbursement", {
    p_disbursement_id: id,
    p_note: optionalText(formData, "cancel_note"),
  });
  if (error) redirect(`/loans/disbursements/${id}?error=${rpcError(error.message)}`);
  refresh(id, contractId);
  redirect(`/loans/disbursements/${id}?status=cancelled`);
}

export async function decideLoanDisbursementAction(formData: FormData) {
  await requireAccess("LOAN_DISBURSEMENT_APPROVE");
  const id = text(formData, "disbursement_id");
  const contractId = text(formData, "contract_id");
  const decision = text(formData, "decision").toUpperCase();
  const note = optionalText(formData, "decision_note");
  if (!["APPROVE", "REJECT"].includes(decision) || (decision === "REJECT" && String(note || "").length < 5)) {
    redirect(`/loans/disbursements/${id}?error=reason`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_loan_disbursement", {
    p_disbursement_id: id,
    p_decision: decision,
    p_note: note,
  });
  if (error) redirect(`/loans/disbursements/${id}?error=${rpcError(error.message)}`);
  refresh(id, contractId);
  redirect(`/loans/disbursements/${id}?status=${decision === "APPROVE" ? "approved" : "rejected"}`);
}

export async function executeLoanDisbursementAction(formData: FormData) {
  const access = await requireAccess("LOAN_DISBURSEMENT_EXECUTE");
  const id = text(formData, "disbursement_id");
  const contractId = text(formData, "contract_id");
  const reference = text(formData, "execution_reference");
  if (reference.length < 3 || reference.length > 120) redirect(`/loans/disbursements/${id}?error=reference`);

  const schema = await getD1SchemaStatus();
  if (!schema.current || !schema.features.treasuryPeriod) redirect(`/loans/disbursements/${id}?error=d1`);
  const supabase = await createClient();
  const { data, error: prepareError } = await supabase.rpc("prepare_loan_disbursement_execution", {
    p_disbursement_id: id,
    p_reference: reference,
  });
  if (prepareError || !data) redirect(`/loans/disbursements/${id}?error=${rpcError(prepareError?.message)}`);

  const payload = object(data);
  if (String(payload.organization_id || "") !== access.organization.id || String(payload.disbursement_id || "") !== id) {
    redirect(`/loans/disbursements/${id}?error=payload`);
  }
  const amount = Number(payload.amount || 0);
  const channel = String(payload.channel || "") as LoanDisbursementChannel;
  const treasuryAccountId = String(payload.treasury_account_id || "");
  const accountingEventCode = String(payload.accounting_event_code || "");
  const contractNumber = String(payload.contract_number || "Kontrak");
  const recipientName = String(payload.recipient_name || "Anggota");
  if (!Number.isSafeInteger(amount) || amount <= 0 || !["CASH", "BANK_TRANSFER"].includes(channel) || !treasuryAccountId) {
    redirect(`/loans/disbursements/${id}?error=payload`);
  }

  let journalId: string;
  try {
    journalId = await postLoanDisbursement({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      disbursementId: id,
      treasuryAccountId,
      channel,
      amount,
      accountingEventCode,
      referenceNumber: String(payload.reference || reference),
      description: `Pencairan ${contractNumber} kepada ${recipientName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting D1 gagal.";
    redirect(`/loans/disbursements/${id}?error=d1-post&detail=${encodeURIComponent(message.slice(0, 180))}`);
  }

  const { error: completeError } = await supabase.rpc("complete_loan_disbursement_execution", {
    p_disbursement_id: id,
    p_d1_journal_entry_id: journalId,
  });
  if (completeError) redirect(`/loans/disbursements/${id}?error=finalize`);
  refresh(id, contractId);
  redirect(`/loans/disbursements/${id}?status=disbursed`);
}
