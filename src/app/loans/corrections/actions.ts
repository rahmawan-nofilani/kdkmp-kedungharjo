"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { postLoanRepaymentReversal } from "@/lib/d1/loan-repayment-reversal";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import { createClient } from "@/lib/supabase/server";

function text(fd:FormData,key:string){return String(fd.get(key)||"").trim();}
function optional(fd:FormData,key:string){return text(fd,key)||null;}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
async function requirePermission(code:string){const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes(code))redirect("/dashboard");return access;}
function refresh(id?:string){revalidatePath("/loans/corrections");revalidatePath("/loans/repayments");revalidatePath("/loans/contracts");revalidatePath("/approvals");revalidatePath("/finance");revalidatePath("/finance/treasury");revalidatePath("/finance/journals");if(id)revalidatePath(`/loans/repayments/${id}`);}
function err(message?:string){const v=String(message||"");if(v.includes("NOT_LATEST_STATE")||v.includes("ALLOCATION_STALE"))return"stale";if(v.includes("ALREADY_EXISTS"))return"exists";if(v.includes("MAKER_CHECKER"))return"maker";if(v.includes("PENDING")||v.includes("CORRECTION_PENDING"))return"pending";if(v.includes("FORBIDDEN"))return"forbidden";if(v.includes("NOTHING_DUE"))return"nothing";if(v.includes("CONTRACT"))return"contract";if(v.includes("REASON_INVALID"))return"reason";if(v.includes("JOURNAL_MISMATCH"))return"journal";return"save";}

export async function createRepaymentReversalAction(fd:FormData){
 await requirePermission("LOAN_CORRECTION_REQUEST");const repaymentId=text(fd,"repayment_id");const reason=text(fd,"reason");if(!repaymentId||reason.length<8)redirect("/loans/corrections?error=invalid");
 const supabase=await createClient();const {data,error}=await supabase.rpc("create_loan_repayment_reversal",{p_repayment_id:repaymentId,p_reason:reason});
 if(error||!data)redirect(`/loans/corrections?error=${err(error?.message)}`);refresh(repaymentId);redirect(`/loans/corrections?status=created&focus=${data}`);
}
export async function submitRepaymentReversalAction(fd:FormData){await requirePermission("LOAN_CORRECTION_REQUEST");const id=text(fd,"reversal_id");const supabase=await createClient();const{error}=await supabase.rpc("submit_loan_repayment_reversal",{p_reversal_id:id});if(error)redirect(`/loans/corrections?error=${err(error.message)}`);refresh();redirect("/loans/corrections?status=submitted");}
export async function cancelRepaymentReversalAction(fd:FormData){await requirePermission("LOAN_CORRECTION_REQUEST");const id=text(fd,"reversal_id");const supabase=await createClient();const{error}=await supabase.rpc("cancel_loan_repayment_reversal",{p_reversal_id:id,p_note:optional(fd,"note")});if(error)redirect(`/loans/corrections?error=${err(error.message)}`);refresh();redirect("/loans/corrections?status=cancelled");}
export async function decideRepaymentReversalAction(fd:FormData){await requirePermission("LOAN_CORRECTION_APPROVE");const id=text(fd,"reversal_id");const decision=text(fd,"decision").toUpperCase();const supabase=await createClient();const{error}=await supabase.rpc("decide_loan_repayment_reversal",{p_reversal_id:id,p_decision:decision,p_note:optional(fd,"note")});if(error)redirect(`/loans/corrections?error=${err(error.message)}`);refresh();redirect(`/loans/corrections?status=${decision.toLowerCase()}d`);}

export async function executeRepaymentReversalAction(fd:FormData){
 const access=await requirePermission("LOAN_CORRECTION_EXECUTE");const id=text(fd,"reversal_id");const schema=await getD1SchemaStatus();if(!schema.current||!schema.features.treasuryPeriod)redirect("/loans/corrections?error=d1");
 const supabase=await createClient();const{data,error}=await supabase.rpc("prepare_loan_repayment_reversal_execution",{p_reversal_id:id});if(error||!data)redirect(`/loans/corrections?error=${err(error?.message)}`);
 const p=object(data);if(String(p.organization_id||"")!==access.organization.id||String(p.reversal_id||"")!==id)redirect("/loans/corrections?error=payload");
 let journalId:string;try{journalId=await postLoanRepaymentReversal({organizationId:access.organization.id,actorUserId:access.user.id,reversalId:id,repaymentId:String(p.repayment_id||""),originalJournalEntryId:String(p.original_journal_entry_id||""),treasuryAccountId:String(p.treasury_account_id||""),reason:String(p.reason||"")});}catch(error){const message=error instanceof Error?error.message:"Posting reversal D1 gagal.";redirect(`/loans/corrections?error=d1-post&detail=${encodeURIComponent(message.slice(0,180))}`);}
 const{error:complete}=await supabase.rpc("complete_loan_repayment_reversal_execution",{p_reversal_id:id,p_d1_journal_entry_id:journalId});if(complete)redirect(`/loans/corrections?error=${err(complete.message)}`);refresh(String(p.repayment_id||""));redirect("/loans/corrections?status=reversed");
}

export async function createFullSettlementAction(fd:FormData){
 const access=await requirePermission("LOAN_REPAYMENT_POST");const contractId=text(fd,"contract_id");const channel=text(fd,"channel").toUpperCase();const treasuryId=text(fd,"treasury_account_id");const reference=text(fd,"reference");if(!contractId||!["CASH","BANK_TRANSFER","QRIS"].includes(channel)||!treasuryId||reference.length<3)redirect("/loans/corrections?error=invalid");
 const schema=await getD1SchemaStatus();if(!schema.current||!schema.features.treasuryPeriod)redirect("/loans/corrections?error=d1");let treasury;try{treasury=(await listTreasuryAccounts(access.organization.id)).find(row=>row.id===treasuryId&&row.status==="ACTIVE");}catch{redirect("/loans/corrections?error=d1");}const expected=channel==="CASH"?"CASH":"BANK";if(!treasury||treasury.account_type!==expected)redirect("/loans/corrections?error=treasury");
 const supabase=await createClient();const{data,error}=await supabase.rpc("create_loan_full_settlement",{p_contract_id:contractId,p_channel:channel,p_treasury_account_id:treasuryId,p_reference:reference,p_note:optional(fd,"note")});if(error||!data)redirect(`/loans/corrections?error=${err(error?.message)}`);refresh(String(data));redirect(`/loans/repayments/${data}?status=settlement-created`);
}
