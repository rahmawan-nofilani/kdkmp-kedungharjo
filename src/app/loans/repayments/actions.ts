"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { postLoanRepayment, type LoanRepaymentChannel } from "@/lib/d1/loan-repayment";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function integer(formData: FormData, key: string) {
  const raw = text(formData, key).replace(/[^0-9-]/g, "");
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
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

function refresh(repaymentId?: string, contractId?: string) {
  revalidatePath("/loans/repayments");
  revalidatePath("/loans/penalties");
  revalidatePath("/loans/contracts");
  revalidatePath("/finance");
  revalidatePath("/finance/treasury");
  revalidatePath("/finance/journals");
  if (repaymentId) revalidatePath(`/loans/repayments/${repaymentId}`);
  if (contractId) revalidatePath(`/loans/contracts/${contractId}`);
}

function rpcError(message?: string) {
  const value = String(message || "");
  if (value.includes("CONTRACT_NOT_ACTIVE")) return "contract";
  if (value.includes("WAIVER_PENDING")) return "waiver";
  if (value.includes("PENDING_EXISTS") || value.includes("loan_repayments_contract_open_uq")) return "pending";
  if (value.includes("PENALTY_STALE")) return "penalty";
  if (value.includes("EXCEEDS_OUTSTANDING")) return "overpay";
  if (value.includes("AMOUNT_INVALID")) return "amount";
  if (value.includes("CHANNEL_INVALID")) return "channel";
  if (value.includes("PRODUCT_SNAPSHOT_INVALID")) return "snapshot";
  if (value.includes("REFERENCE_INVALID")) return "reference";
  if (value.includes("ALLOCATION_STALE")) return "stale";
  if (value.includes("JOURNAL_MISMATCH")) return "journal";
  if (value.includes("FORBIDDEN")) return "forbidden";
  return "save";
}

export async function createLoanRepaymentAction(formData: FormData) {
  const access = await requireAccess("LOAN_REPAYMENT_POST");
  const contractId = text(formData, "contract_id");
  const channel = text(formData, "channel").toUpperCase() as LoanRepaymentChannel;
  const treasuryAccountId = text(formData, "treasury_account_id");
  const amount = integer(formData, "amount");
  const reference = text(formData, "payment_reference");
  if (!contractId || !["CASH", "BANK_TRANSFER", "QRIS"].includes(channel) || !treasuryAccountId || amount <= 0 || reference.length < 3) {
    redirect("/loans/repayments?error=invalid");
  }

  const schema = await getD1SchemaStatus();
  if (!schema.current || !schema.features.treasuryPeriod) redirect("/loans/repayments?error=d1");
  let treasury;
  try {
    const accounts = await listTreasuryAccounts(access.organization.id);
    treasury = accounts.find((row) => row.id === treasuryAccountId && row.status === "ACTIVE");
  } catch {
    redirect("/loans/repayments?error=d1");
  }
  const expectedType = channel === "CASH" ? "CASH" : "BANK";
  if (!treasury || treasury.account_type !== expectedType) redirect("/loans/repayments?error=treasury");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_loan_repayment", {
    p_contract_id: contractId,
    p_channel: channel,
    p_treasury_account_id: treasuryAccountId,
    p_amount: amount,
    p_reference: reference,
    p_note: optionalText(formData, "request_note"),
  });
  if (error || !data) redirect(`/loans/repayments?error=${rpcError(error?.message)}`);
  refresh(String(data), contractId);
  redirect(`/loans/repayments/${data}?status=created`);
}

export async function cancelLoanRepaymentAction(formData: FormData) {
  await requireAccess("LOAN_REPAYMENT_POST");
  const id = text(formData, "repayment_id");
  const contractId = text(formData, "contract_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_loan_repayment", {
    p_repayment_id: id,
    p_note: optionalText(formData, "cancel_note"),
  });
  if (error) redirect(`/loans/repayments/${id}?error=${rpcError(error.message)}`);
  refresh(id, contractId);
  redirect(`/loans/repayments/${id}?status=cancelled`);
}

export async function executeLoanRepaymentAction(formData: FormData) {
  const access = await requireAccess("LOAN_REPAYMENT_POST");
  const id = text(formData, "repayment_id");
  const contractId = text(formData, "contract_id");
  const schema = await getD1SchemaStatus();
  if (!schema.current || !schema.features.treasuryPeriod) redirect(`/loans/repayments/${id}?error=d1`);

  const supabase = await createClient();
  const { data, error: prepareError } = await supabase.rpc("prepare_loan_repayment_execution", {
    p_repayment_id: id,
  });
  if (prepareError || !data) redirect(`/loans/repayments/${id}?error=${rpcError(prepareError?.message)}`);

  const payload = object(data);
  if (String(payload.organization_id || "") !== access.organization.id || String(payload.repayment_id || "") !== id) {
    redirect(`/loans/repayments/${id}?error=payload`);
  }

  const totalAmount = Number(payload.total_amount || 0);
  const principalAmount = Number(payload.principal_amount || 0);
  const interestAmount = Number(payload.interest_amount || 0);
  const penaltyAmount = Number(payload.penalty_amount || 0);
  const channel = String(payload.channel || "") as LoanRepaymentChannel;
  const treasuryAccountId = String(payload.treasury_account_id || "");
  const reference = String(payload.payment_reference || "");
  const contractNumber = String(payload.contract_number || "Kontrak");
  const principalEvent = String(payload.principal_accounting_event_code || "");
  const interestEvent = String(payload.interest_accounting_event_code || "");
  const penaltyEvent = String(payload.penalty_accounting_event_code || "");

  if (
    !Number.isSafeInteger(totalAmount) || totalAmount <= 0 ||
    !Number.isSafeInteger(principalAmount) || principalAmount < 0 ||
    !Number.isSafeInteger(interestAmount) || interestAmount < 0 ||
    !Number.isSafeInteger(penaltyAmount) || penaltyAmount < 0 ||
    totalAmount !== principalAmount + interestAmount + penaltyAmount ||
    !["CASH", "BANK_TRANSFER", "QRIS"].includes(channel) || !treasuryAccountId || reference.length < 3
  ) {
    redirect(`/loans/repayments/${id}?error=payload`);
  }

  let journalId: string;
  try {
    journalId = await postLoanRepayment({
      organizationId: access.organization.id,
      actorUserId: access.user.id,
      repaymentId: id,
      treasuryAccountId,
      channel,
      totalAmount,
      principalAmount,
      interestAmount,
      penaltyAmount,
      principalAccountingEventCode: principalEvent,
      interestAccountingEventCode: interestEvent,
      penaltyAccountingEventCode: penaltyEvent,
      referenceNumber: reference,
      description: `Angsuran ${contractNumber}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting D1 gagal.";
    redirect(`/loans/repayments/${id}?error=d1-post&detail=${encodeURIComponent(message.slice(0, 180))}`);
  }

  const { error: completeError } = await supabase.rpc("complete_loan_repayment_execution", {
    p_repayment_id: id,
    p_d1_journal_entry_id: journalId,
  });
  if (completeError) redirect(`/loans/repayments/${id}?error=${rpcError(completeError.message)}`);
  refresh(id, contractId);
  redirect(`/loans/repayments/${id}?status=posted`);
}
