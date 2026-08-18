"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData,key: string){return String(formData.get(key)||"").trim();}
function optionalText(formData: FormData,key: string){return text(formData,key)||null;}
function integer(formData: FormData,key: string){const value=Number(text(formData,key).replace(/[^0-9-]/g,""));return Number.isSafeInteger(value)&&value>=0?value:0;}

async function requireAccess(permission:string){
  const access=await getAccessContext();
  if(!access) redirect("/login");
  if(!access.permissions.includes(permission)) redirect("/dashboard");
  return access;
}

function refresh(){
  revalidatePath("/loans/penalties");
  revalidatePath("/loans/repayments");
  revalidatePath("/loans/contracts");
  revalidatePath("/approvals");
}

function rpcError(message?:string){
  const value=String(message||"");
  if(value.includes("CONTRACT_NOT_ACTIVE")) return "contract";
  if(value.includes("INSTALLMENT_NOT_FOUND")) return "installment";
  if(value.includes("WAIVER_AMOUNT_INVALID")) return "amount";
  if(value.includes("WAIVER_REASON_INVALID")) return "reason";
  if(value.includes("WAIVER_EXCEEDS_DUE")) return "exceeds";
  if(value.includes("WAIVER_PENDING")) return "pending";
  if(value.includes("REPAYMENT_PENDING")) return "repayment";
  if(value.includes("MAKER_CANNOT_APPROVE")) return "maker";
  if(value.includes("REJECTION_REASON_REQUIRED")) return "reject-reason";
  if(value.includes("NOT_DRAFT")||value.includes("NOT_SUBMITTED")||value.includes("NOT_CANCELLABLE")) return "state";
  if(value.includes("FORBIDDEN")) return "forbidden";
  return "save";
}

export async function assessLoanPenaltyAction(formData:FormData){
  const access=await getAccessContext();
  if(!access) redirect("/login");
  const contractId=text(formData,"contract_id");
  if(!contractId) redirect("/loans/penalties?error=contract");
  if(!access.permissions.includes("LOAN_REPAYMENT_POST")&&!access.permissions.includes("LOAN_PENALTY_WAIVE_REQUEST")) redirect("/dashboard");
  const supabase=await createClient();
  const {error}=await supabase.rpc("assess_loan_penalties",{p_contract_id:contractId});
  if(error) redirect(`/loans/penalties?error=${rpcError(error.message)}`);
  refresh();
  redirect("/loans/penalties?status=assessed");
}

export async function createLoanPenaltyWaiverAction(formData:FormData){
  await requireAccess("LOAN_PENALTY_WAIVE_REQUEST");
  const installmentId=text(formData,"installment_id");
  const amount=integer(formData,"requested_amount");
  const reason=text(formData,"reason");
  if(!installmentId||amount<=0||reason.length<8) redirect("/loans/penalties?error=invalid");
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("create_loan_penalty_waiver",{p_installment_id:installmentId,p_amount:amount,p_reason:reason});
  if(error||!data) redirect(`/loans/penalties?error=${rpcError(error?.message)}`);
  refresh();
  redirect(`/loans/penalties?status=waiver-created#waiver-${data}`);
}

export async function submitLoanPenaltyWaiverAction(formData:FormData){
  await requireAccess("LOAN_PENALTY_WAIVE_REQUEST");
  const id=text(formData,"waiver_id");
  const supabase=await createClient();
  const {error}=await supabase.rpc("submit_loan_penalty_waiver",{p_waiver_id:id});
  if(error) redirect(`/loans/penalties?error=${rpcError(error.message)}#waiver-${id}`);
  refresh();
  redirect(`/loans/penalties?status=submitted#waiver-${id}`);
}

export async function cancelLoanPenaltyWaiverAction(formData:FormData){
  await requireAccess("LOAN_PENALTY_WAIVE_REQUEST");
  const id=text(formData,"waiver_id");
  const supabase=await createClient();
  const {error}=await supabase.rpc("cancel_loan_penalty_waiver",{p_waiver_id:id,p_note:optionalText(formData,"cancel_note")});
  if(error) redirect(`/loans/penalties?error=${rpcError(error.message)}#waiver-${id}`);
  refresh();
  redirect("/loans/penalties?status=cancelled");
}

export async function decideLoanPenaltyWaiverAction(formData:FormData){
  await requireAccess("LOAN_PENALTY_WAIVE_APPROVE");
  const id=text(formData,"waiver_id");
  const decision=text(formData,"decision").toUpperCase();
  const note=optionalText(formData,"decision_note");
  if(!["APPROVE","REJECT"].includes(decision)||(decision==="REJECT"&&String(note||"").length<5)) redirect(`/loans/penalties?error=reject-reason#waiver-${id}`);
  const supabase=await createClient();
  const {error}=await supabase.rpc("decide_loan_penalty_waiver",{p_waiver_id:id,p_decision:decision,p_note:note});
  if(error) redirect(`/loans/penalties?error=${rpcError(error.message)}#waiver-${id}`);
  refresh();
  redirect(`/loans/penalties?status=${decision==="APPROVE"?"approved":"rejected"}`);
}
