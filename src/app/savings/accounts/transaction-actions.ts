"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift } from "@/lib/d1/teller";
import { postSavingsTransaction } from "@/lib/d1/savings-posting";
import { reverseSavingsTransaction, syncSavingsLedgerAccount, type SavingsRuleSnapshot } from "@/lib/d1/savings-ledger";

function text(formData:FormData,key:string){return String(formData.get(key)||"").trim();}
function amount(formData:FormData){const n=Number(text(formData,"amount").replace(/[^0-9]/g,""));return Number.isSafeInteger(n)&&n>0?n:0;}

async function requireAccess(permission:string){
  const access=await getAccessContext();
  if(!access)redirect("/login");
  if(!access.permissions.includes(permission))redirect("/dashboard");
  const schema=await getD1SchemaStatus();
  if(!schema.features.savingsLedger)redirect("/setup/database");
  return access;
}

async function loadActiveAccount(accountId:string,organizationId:string){
  const supabase=await createClient();
  const {data,error}=await supabase.from("savings_accounts")
    .select("id,organization_id,member_id,product_id,product_version_id,account_number,status,rule_snapshot,opened_at")
    .eq("id",accountId).eq("organization_id",organizationId).maybeSingle();
  if(error||!data||data.status!=="ACTIVE")return null;
  return data as {id:string;organization_id:string;member_id:string;product_id:string;product_version_id:string;account_number:string;status:string;rule_snapshot:SavingsRuleSnapshot;opened_at:string};
}

async function ensureLedgerAccount(accountId:string,organizationId:string){
  const account=await loadActiveAccount(accountId,organizationId);
  if(!account)throw new Error("ACCOUNT_NOT_ACTIVE");
  const rules=account.rule_snapshot||{};
  await syncSavingsLedgerAccount({
    organizationId,
    savingsAccountId:account.id,
    memberId:account.member_id,
    productId:account.product_id,
    productVersionId:account.product_version_id,
    accountNumber:account.account_number,
    productCode:String(rules.product_code||"SAVINGS"),
    openedAt:account.opened_at,
    rules,
  });
  return account;
}

function errorCode(error:unknown){
  const m=(error instanceof Error?error.message:String(error)).toUpperCase();
  if(m.includes("OPEN_SHIFT"))return "shift";
  if(m.includes("BELOW_MINIMUM"))return "minimum";
  if(m.includes("MIN_BALANCE")||m.includes("NEGATIVE_BALANCE"))return "balance";
  if(m.includes("MAX_BALANCE"))return "maximum";
  if(m.includes("LOCKED"))return "locked";
  if(m.includes("NOT_MATURED"))return "maturity";
  if(m.includes("DEPOSIT_DISABLED"))return "deposit-disabled";
  if(m.includes("WITHDRAWAL_DISABLED"))return "withdraw-disabled";
  if(m.includes("HARUS MEMAKAI AKUN KAS")||m.includes("TRANSFER HARUS MEMAKAI AKUN BANK"))return "treasury";
  if(m.includes("MAPPING"))return "mapping";
  if(m.includes("ACCOUNT_NOT_ACTIVE")||m.includes("REKENING"))return "account";
  if(m.includes("ACCOUNTING_PERIOD_CLOSED")||m.includes("ACCOUNTING_PERIOD_LOCKED")||m.includes("PERIOD"))return "period";
  if(m.includes("ALREADY")||m.includes("SUDAH MEMILIKI PEMBALIKAN"))return "reversed";
  return "save";
}

async function post(formData:FormData,type:"DEPOSIT"|"WITHDRAWAL"){
  const access=await requireAccess(type==="DEPOSIT"?"SAVINGS_DEPOSIT":"SAVINGS_WITHDRAW");
  const accountId=text(formData,"account_id"); const nominal=amount(formData);
  const method=text(formData,"payment_method") as "CASH"|"BANK_TRANSFER";
  const treasuryAccountId=text(formData,"treasury_account_id"); const key=text(formData,"idempotency_key");
  if(!accountId||!nominal||!treasuryAccountId||!key||!["CASH","BANK_TRANSFER"].includes(method))redirect(`/savings/accounts/${accountId}?error=invalid`);
  try{
    await ensureLedgerAccount(accountId,access.organization.id);
    const shift=method==="CASH"?await getOpenShift(access.organization.id,access.user.id):null;
    if(method==="CASH"&&!shift)throw new Error("SAVINGS_OPEN_SHIFT_REQUIRED");
    await postSavingsTransaction({
      organizationId:access.organization.id,actorUserId:access.user.id,savingsAccountId:accountId,type,amount:nominal,
      paymentMethod:method,treasuryAccountId,shiftId:shift?.id||null,referenceNumber:text(formData,"reference_number")||null,
      note:text(formData,"note")||null,idempotencyKey:key,
    });
  }catch(error){redirect(`/savings/accounts/${accountId}?error=${errorCode(error)}`);}
  for(const path of [`/savings/accounts/${accountId}`,"/savings/accounts","/teller","/closing","/finance","/finance/treasury"])revalidatePath(path);
  redirect(`/savings/accounts/${accountId}?status=${type==="DEPOSIT"?"deposited":"withdrawn"}`);
}

export async function depositSavingsAction(formData:FormData){return post(formData,"DEPOSIT");}
export async function withdrawSavingsAction(formData:FormData){return post(formData,"WITHDRAWAL");}

export async function reverseSavingsAction(formData:FormData){
  const access=await requireAccess("SAVINGS_REVERSE");
  const accountId=text(formData,"account_id"); const transactionId=text(formData,"transaction_id"); const reason=text(formData,"reason"); const key=text(formData,"idempotency_key");
  if(!accountId||!transactionId||!key||reason.length<8)redirect(`/savings/accounts/${accountId}?error=reason`);
  try{
    await ensureLedgerAccount(accountId,access.organization.id);
    const shift=await getOpenShift(access.organization.id,access.user.id);
    await reverseSavingsTransaction({organizationId:access.organization.id,actorUserId:access.user.id,transactionId,shiftId:shift?.id||null,reason,idempotencyKey:key});
  }catch(error){redirect(`/savings/accounts/${accountId}?error=${errorCode(error)}`);}
  for(const path of [`/savings/accounts/${accountId}`,"/savings/accounts","/teller","/closing","/finance","/finance/treasury"])revalidatePath(path);
  redirect(`/savings/accounts/${accountId}?status=reversed`);
}
