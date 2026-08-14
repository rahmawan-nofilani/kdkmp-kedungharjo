import { ensureAccountingFoundation, getActiveAccountingMapping } from "./accounting-config";
import { getD1, type D1PreparedLike } from "./context";
import { ensureTreasuryFoundation } from "./treasury";

export type SavingsRuleSnapshot = {
  display_name?: string;
  min_opening_amount?: number;
  min_deposit_amount?: number;
  min_withdrawal_amount?: number;
  min_balance_amount?: number;
  max_balance_amount?: number | null;
  lock_days?: number;
  maturity_days?: number | null;
  early_withdrawal_allowed?: boolean;
  deposit_enabled?: boolean;
  withdrawal_enabled?: boolean;
  deposit_accounting_event_code?: string;
  withdrawal_accounting_event_code?: string;
  product_code?: string;
  captured_version?: number;
  [key: string]: unknown;
};

export type SavingsLedgerAccountRow = {
  id:string; organization_id:string; member_id:string; product_id:string; product_version_id:string;
  account_number:string; product_code:string; product_name:string; status:string; opened_at:string;
  min_opening_amount:number; min_deposit_amount:number; min_withdrawal_amount:number; min_balance_amount:number;
  max_balance_amount:number|null; lock_until:string|null; maturity_date:string|null; early_withdrawal_allowed:number;
  deposit_enabled:number; withdrawal_enabled:number; deposit_event_code:string; withdrawal_event_code:string;
  balance_amount:number;
};

export type SavingsTransactionRow = {
  id:string; transaction_number:string; savings_account_id:string; transaction_type:"DEPOSIT"|"WITHDRAWAL"|"REVERSAL";
  amount:number; balance_delta_amount:number; payment_method:"CASH"|"BANK_TRANSFER";
  treasury_account_id:string; treasury_name:string; reference_number:string|null; note:string|null;
  journal_entry_id:string; journal_number:string; original_transaction_id:string|null; reversal_reason:string|null;
  actor_user_id:string; occurred_at:string;
};

function nowIso(){ return new Date().toISOString(); }
function documentNumber(prefix:string){ return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().replace(/-/g,"").slice(0,5).toUpperCase()}`; }
function integer(value:unknown){ const n=Number(value??0); return Number.isSafeInteger(n)&&n>=0?n:0; }
function optionalInteger(value:unknown){ if(value===null||value===undefined||value==="") return null; const n=Number(value); return Number.isSafeInteger(n)&&n>=0?n:null; }
function addDays(iso:string,days:number|null){ if(!days||days<=0)return null; const ms=Date.parse(iso); if(!Number.isFinite(ms))return null; return new Date(ms+days*86_400_000).toISOString().slice(0,10); }
function eventCode(value:unknown,fallback:string){const code=String(value||fallback).trim().toUpperCase();if(!/^[A-Z][A-Z0-9_]{2,59}$/.test(code))throw new Error("Kode mapping akuntansi produk tidak valid.");return code;}

async function ensureSavingsAccountingFoundation(organizationId:string){
  await ensureAccountingFoundation(organizationId);
}

async function ensureSavingsEventFoundation(organizationId:string,code:string,kind:"DEPOSIT"|"WITHDRAWAL",productName:string){
  await ensureSavingsAccountingFoundation(organizationId);
  const db=getD1();
  const existing=await db.prepare("SELECT id FROM accounting_mappings WHERE organization_id=? AND event_code=? LIMIT 1")
    .bind(organizationId,code).first<{id:string}>();
  if(existing)return;
  if(!/^SAVINGS_(DEPOSIT|WITHDRAWAL)(_[A-Z0-9_]{2,40})?$/.test(code))throw new Error("Kode mapping khusus simpanan harus diawali SAVINGS_DEPOSIT atau SAVINGS_WITHDRAWAL.");
  if(kind==="DEPOSIT"&&!code.startsWith("SAVINGS_DEPOSIT"))throw new Error("Kode mapping setoran harus diawali SAVINGS_DEPOSIT.");
  if(kind==="WITHDRAWAL"&&!code.startsWith("SAVINGS_WITHDRAWAL"))throw new Error("Kode mapping penarikan harus diawali SAVINGS_WITHDRAWAL.");
  const now=nowIso();
  const mapId=`map:${organizationId}:${code}`;const versionId=`mapv:${organizationId}:${code}:1`;
  const cashId=`acct:${organizationId}:1-1000`;const liabilityId=`acct:${organizationId}:2-2000`;
  const debitId=kind==="DEPOSIT"?cashId:liabilityId;const creditId=kind==="DEPOSIT"?liabilityId:cashId;
  const label=`${kind==="DEPOSIT"?"Setoran":"Penarikan"} ${productName}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO accounting_mappings
      (id,organization_id,event_code,event_name,status,current_approved_version,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,'ACTIVE',1,'SYSTEM_FOUNDATION','SYSTEM_FOUNDATION',?,?)`).bind(mapId,organizationId,code,label,now,now),
    db.prepare(`INSERT OR IGNORE INTO accounting_mapping_versions
      (id,mapping_id,version,debit_account_id,credit_account_id,status,change_note,created_by,approved_by,created_at,approved_at)
      VALUES (?,?,1,?,?,'APPROVED','Default product savings mapping','SYSTEM_FOUNDATION','SYSTEM_FOUNDATION',?,?)`)
      .bind(versionId,mapId,debitId,creditId,now,now),
  ]);
}

export async function syncSavingsLedgerAccount(input:{
  organizationId:string; savingsAccountId:string; memberId:string; productId:string; productVersionId:string;
  accountNumber:string; productCode:string; openedAt:string; rules:SavingsRuleSnapshot;
}){
  await ensureSavingsAccountingFoundation(input.organizationId);
  const db=getD1(); const now=nowIso(); const rules=input.rules||{};
  const productName=String(rules.display_name||input.productCode);
  const depositEventCode=eventCode(rules.deposit_accounting_event_code,"SAVINGS_DEPOSIT");
  const withdrawalEventCode=eventCode(rules.withdrawal_accounting_event_code,"SAVINGS_WITHDRAWAL");
  await ensureSavingsEventFoundation(input.organizationId,depositEventCode,"DEPOSIT",productName);
  await ensureSavingsEventFoundation(input.organizationId,withdrawalEventCode,"WITHDRAWAL",productName);
  const lockDays=integer(rules.lock_days); const maturityDays=optionalInteger(rules.maturity_days);
  await db.prepare(`INSERT OR IGNORE INTO savings_ledger_accounts (
    id,organization_id,member_id,product_id,product_version_id,account_number,product_code,product_name,status,opened_at,
    min_opening_amount,min_deposit_amount,min_withdrawal_amount,min_balance_amount,max_balance_amount,lock_until,maturity_date,
    early_withdrawal_allowed,deposit_enabled,withdrawal_enabled,deposit_event_code,withdrawal_event_code,rule_snapshot_json,created_at
  ) VALUES (?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    input.savingsAccountId,input.organizationId,input.memberId,input.productId,input.productVersionId,input.accountNumber,input.productCode,
    productName,input.openedAt,integer(rules.min_opening_amount),integer(rules.min_deposit_amount),
    integer(rules.min_withdrawal_amount),integer(rules.min_balance_amount),optionalInteger(rules.max_balance_amount),
    addDays(input.openedAt,lockDays),addDays(input.openedAt,maturityDays),rules.early_withdrawal_allowed===false?0:1,
    rules.deposit_enabled===false?0:1,rules.withdrawal_enabled===false?0:1,
    depositEventCode,withdrawalEventCode,JSON.stringify(rules),now,
  ).run();
  const row=await db.prepare(`SELECT id,product_version_id,deposit_event_code,withdrawal_event_code FROM savings_ledger_accounts WHERE id=? AND organization_id=? LIMIT 1`)
    .bind(input.savingsAccountId,input.organizationId).first<{id:string;product_version_id:string;deposit_event_code:string;withdrawal_event_code:string}>();
  if(!row) throw new Error("Ledger rekening simpanan belum dapat dibuat.");
  if(row.product_version_id!==input.productVersionId) throw new Error("Versi aturan ledger tidak sama dengan rekening sumber.");
  if(row.deposit_event_code!==depositEventCode||row.withdrawal_event_code!==withdrawalEventCode)throw new Error("Mapping rekening tidak sama dengan versi produk saat rekening dibuka.");
}

export async function getSavingsLedgerAccount(organizationId:string,savingsAccountId:string){
  const db=getD1();
  const row=await db.prepare(`SELECT a.*,
      COALESCE((SELECT SUM(t.balance_delta_amount) FROM savings_ledger_transactions t WHERE t.organization_id=a.organization_id AND t.savings_account_id=a.id),0) AS balance_amount
    FROM savings_ledger_accounts a WHERE a.id=? AND a.organization_id=? LIMIT 1`)
    .bind(savingsAccountId,organizationId).first<SavingsLedgerAccountRow>();
  if(!row)return null;
  return {...row,min_opening_amount:Number(row.min_opening_amount),min_deposit_amount:Number(row.min_deposit_amount),min_withdrawal_amount:Number(row.min_withdrawal_amount),min_balance_amount:Number(row.min_balance_amount),max_balance_amount:row.max_balance_amount==null?null:Number(row.max_balance_amount),balance_amount:Number(row.balance_amount)};
}

export async function getSavingsBalances(organizationId:string,accountIds:string[]){
  if(!accountIds.length)return new Map<string,number>();
  const db=getD1(); const placeholders=accountIds.map(()=>"?").join(",");
  const rows=await db.prepare(`SELECT savings_account_id,COALESCE(SUM(balance_delta_amount),0) AS balance_amount
    FROM savings_ledger_transactions WHERE organization_id=? AND savings_account_id IN (${placeholders}) GROUP BY savings_account_id`)
    .bind(organizationId,...accountIds).all<{savings_account_id:string;balance_amount:number}>();
  return new Map(rows.results.map(r=>[r.savings_account_id,Number(r.balance_amount)]));
}

async function treasuryForPosting(organizationId:string,treasuryAccountId:string,paymentMethod:"CASH"|"BANK_TRANSFER"){
  await ensureTreasuryFoundation(organizationId);
  const db=getD1();
  const row=await db.prepare(`SELECT ta.id,ta.name,ta.account_type,ta.status,ca.code AS chart_code,ca.account_type AS chart_type,ca.status AS chart_status
    FROM treasury_accounts ta JOIN chart_of_accounts ca ON ca.id=ta.chart_account_id
    WHERE ta.id=? AND ta.organization_id=? LIMIT 1`).bind(treasuryAccountId,organizationId)
    .first<{id:string;name:string;account_type:string;status:string;chart_code:string;chart_type:string;chart_status:string}>();
  if(!row||row.status!=="ACTIVE"||row.chart_status!=="ACTIVE"||row.chart_type!=="ASSET")throw new Error("Kas/Bank tidak aktif.");
  if(paymentMethod==="CASH"&&row.account_type!=="CASH")throw new Error("Setoran/penarikan tunai harus memakai akun Kas.");
  if(paymentMethod==="BANK_TRANSFER"&&row.account_type!=="BANK")throw new Error("Transfer harus memakai akun Bank.");
  return row;
}

async function savingsMapping(organizationId:string,eventCodeValue:string,kind:"DEPOSIT"|"WITHDRAWAL"){
  await ensureSavingsAccountingFoundation(organizationId);
  const code=eventCode(eventCodeValue,kind==="DEPOSIT"?"SAVINGS_DEPOSIT":"SAVINGS_WITHDRAWAL");
  const mapping=await getActiveAccountingMapping(organizationId,code);
  if(!mapping)throw new Error(`Mapping akuntansi ${code} belum APPROVED.`);
  const liabilityCode=kind==="DEPOSIT"?mapping.credit_code:mapping.debit_code;
  const db=getD1();
  const account=await db.prepare(`SELECT code,account_type,status FROM chart_of_accounts WHERE organization_id=? AND code=? LIMIT 1`)
    .bind(organizationId,liabilityCode).first<{code:string;account_type:string;status:string}>();
  if(!account||account.status!=="ACTIVE"||account.account_type!=="LIABILITY")throw new Error("Mapping simpanan harus memakai akun kewajiban aktif pada sisi Simpanan Anggota.");
  return {version:Number(mapping.version),liabilityCode:account.code,eventCode:code};
}

export async function postSavingsTransaction(input:{
  organizationId:string; actorUserId:string; savingsAccountId:string; type:"DEPOSIT"|"WITHDRAWAL"; amount:number;
  paymentMethod:"CASH"|"BANK_TRANSFER"; treasuryAccountId:string; shiftId?:string|null; referenceNumber?:string|null;
  note?:string|null; idempotencyKey:string;
}){
  if(!Number.isSafeInteger(input.amount)||input.amount<=0)throw new Error("Nominal transaksi harus lebih dari Rp0.");
  const db=getD1();
  const existing=await db.prepare(`SELECT resource_id FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1`)
    .bind(input.organizationId,input.idempotencyKey).first<{resource_id:string|null}>();
  if(existing?.resource_id)return existing.resource_id;

  const account=await getSavingsLedgerAccount(input.organizationId,input.savingsAccountId);
  if(!account||account.status!=="ACTIVE")throw new Error("Rekening ledger belum ACTIVE.");
  const treasury=await treasuryForPosting(input.organizationId,input.treasuryAccountId,input.paymentMethod);
  const eventCodeValue=input.type==="DEPOSIT"?account.deposit_event_code:account.withdrawal_event_code;
  const mapping=await savingsMapping(input.organizationId,eventCodeValue,input.type);
  const transactionId=crypto.randomUUID(); const journalId=crypto.randomUUID(); const now=nowIso();
  const transactionNumber=documentNumber(input.type==="DEPOSIT"?"SDEP":"SWDR");
  const journalNumber=documentNumber("JRN-SAV");
  const delta=input.type==="DEPOSIT"?input.amount:-input.amount;
  const debitCode=input.type==="DEPOSIT"?treasury.chart_code:mapping.liabilityCode;
  const creditCode=input.type==="DEPOSIT"?mapping.liabilityCode:treasury.chart_code;
  const description=`${input.type==="DEPOSIT"?"Setoran":"Penarikan"} simpanan ${account.account_number}`;
  const statements:D1PreparedLike[]=[
    db.prepare(`INSERT INTO request_idempotency (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?,?,?,?,'COMPLETED',?,NULL)`).bind(input.organizationId,input.idempotencyKey,`SAVINGS_${input.type}`,JSON.stringify({account:account.id,amount:input.amount,method:input.paymentMethod}),transactionId,now),
    db.prepare(`INSERT INTO journal_entries (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'SAVINGS_TRANSACTION',?,?, 'POSTED',?,?,?)`).bind(journalId,input.organizationId,journalNumber,transactionId,description,input.actorUserId,now,now),
    db.prepare(`INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,?,0,?,?)`)
      .bind(crypto.randomUUID(),journalId,debitCode,input.amount,description,now),
    db.prepare(`INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,0,?,?,?)`)
      .bind(crypto.randomUUID(),journalId,creditCode,input.amount,description,now),
    db.prepare(`INSERT INTO savings_ledger_transactions (
      id,organization_id,savings_account_id,transaction_number,transaction_type,amount,balance_delta_amount,payment_method,
      treasury_account_id,shift_id,reference_number,note,source_event_code,accounting_mapping_version,asset_account_code,liability_account_code,
      journal_entry_id,original_transaction_id,reversal_reason,actor_user_id,occurred_at,idempotency_key,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?)`).bind(
      transactionId,input.organizationId,account.id,transactionNumber,input.type,input.amount,delta,input.paymentMethod,treasury.id,
      input.paymentMethod==="CASH"?(input.shiftId||null):null,input.referenceNumber?.trim()||null,input.note?.trim()||null,mapping.eventCode,mapping.version,
      treasury.chart_code,mapping.liabilityCode,journalId,input.actorUserId,now,input.idempotencyKey,now,
    ),
    db.prepare(`INSERT INTO transaction_audit_events (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,?,'SAVINGS_TRANSACTION',?,?,?)`).bind(crypto.randomUUID(),input.organizationId,input.actorUserId,`SAVINGS_${input.type}_POSTED`,transactionId,JSON.stringify({accountNumber:account.account_number,amount:input.amount,method:input.paymentMethod,eventCode:mapping.eventCode,mappingVersion:mapping.version,assetAccount:treasury.chart_code,liabilityAccount:mapping.liabilityCode}),now),
  ];
  await db.batch(statements);
  return transactionId;
}

export async function reverseSavingsTransaction(input:{organizationId:string;actorUserId:string;transactionId:string;shiftId?:string|null;reason:string;idempotencyKey:string}){
  const reason=input.reason.trim(); if(reason.length<8||reason.length>240)throw new Error("Alasan pembalikan wajib 8–240 karakter.");
  const db=getD1();
  const existingIdempotency=await db.prepare(`SELECT resource_id FROM request_idempotency WHERE organization_id=? AND idempotency_key=? LIMIT 1`)
    .bind(input.organizationId,input.idempotencyKey).first<{resource_id:string|null}>();
  if(existingIdempotency?.resource_id)return existingIdempotency.resource_id;
  const original=await db.prepare(`SELECT t.*,ta.name AS treasury_name FROM savings_ledger_transactions t JOIN treasury_accounts ta ON ta.id=t.treasury_account_id
    WHERE t.id=? AND t.organization_id=? LIMIT 1`).bind(input.transactionId,input.organizationId).first<SavingsTransactionRow & {source_event_code:string;accounting_mapping_version:number;asset_account_code:string;liability_account_code:string}>();
  if(!original)throw new Error("Transaksi asal tidak ditemukan.");
  if(original.transaction_type==="REVERSAL")throw new Error("Transaksi pembalik tidak dapat dibalik lagi pada fase ini.");
  const already=await db.prepare(`SELECT id FROM savings_ledger_transactions WHERE original_transaction_id=? LIMIT 1`).bind(original.id).first<{id:string}>();
  if(already)throw new Error("Transaksi ini sudah memiliki pembalikan.");
  const treasury=await treasuryForPosting(input.organizationId,original.treasury_account_id,original.payment_method);
  const reversalId=crypto.randomUUID(); const journalId=crypto.randomUUID(); const now=nowIso();
  const transactionNumber=documentNumber("SREV"); const journalNumber=documentNumber("JRN-SREV");
  const delta=-Number(original.balance_delta_amount); const debitCode=Number(original.balance_delta_amount)>0?original.liability_account_code:original.asset_account_code;
  const creditCode=Number(original.balance_delta_amount)>0?original.asset_account_code:original.liability_account_code;
  const description=`Pembalikan ${original.transaction_number}: ${reason}`;
  await db.batch([
    db.prepare(`INSERT INTO request_idempotency (organization_id,idempotency_key,operation,request_hash,resource_id,status,created_at,expires_at)
      VALUES (?,?, 'SAVINGS_REVERSAL',?,?, 'COMPLETED',?,NULL)`).bind(input.organizationId,input.idempotencyKey,JSON.stringify({original:original.id,reason}),reversalId,now),
    db.prepare(`INSERT INTO journal_entries (id,organization_id,entry_number,source_type,source_id,description,status,posted_by,posted_at,created_at)
      VALUES (?,?,?,'SAVINGS_REVERSAL',?,?, 'POSTED',?,?,?)`).bind(journalId,input.organizationId,journalNumber,reversalId,description,input.actorUserId,now,now),
    db.prepare(`INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,?,0,?,?)`).bind(crypto.randomUUID(),journalId,debitCode,original.amount,description,now),
    db.prepare(`INSERT INTO journal_lines (id,journal_entry_id,account_code,debit_amount,credit_amount,memo,created_at) VALUES (?,?,?,0,?,?,?)`).bind(crypto.randomUUID(),journalId,creditCode,original.amount,description,now),
    db.prepare(`INSERT INTO savings_ledger_transactions (
      id,organization_id,savings_account_id,transaction_number,transaction_type,amount,balance_delta_amount,payment_method,treasury_account_id,shift_id,
      reference_number,note,source_event_code,accounting_mapping_version,asset_account_code,liability_account_code,journal_entry_id,original_transaction_id,
      reversal_reason,actor_user_id,occurred_at,idempotency_key,created_at
    ) VALUES (?,?,?,?, 'REVERSAL',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      reversalId,input.organizationId,original.savings_account_id,transactionNumber,original.amount,delta,original.payment_method,treasury.id,
      original.payment_method==="CASH"?(input.shiftId||null):null,original.reference_number,`Pembalikan ${original.transaction_number}`,original.source_event_code,
      Number(original.accounting_mapping_version),original.asset_account_code,original.liability_account_code,journalId,original.id,reason,input.actorUserId,now,input.idempotencyKey,now,
    ),
    db.prepare(`INSERT INTO transaction_audit_events (id,organization_id,actor_user_id,event_type,entity_type,entity_id,payload_json,created_at)
      VALUES (?,?,?,'SAVINGS_TRANSACTION_REVERSED','SAVINGS_TRANSACTION',?,?,?)`).bind(crypto.randomUUID(),input.organizationId,input.actorUserId,reversalId,JSON.stringify({originalTransactionId:original.id,amount:original.amount,reason}),now),
  ]);
  return reversalId;
}

export async function listSavingsTransactions(organizationId:string,savingsAccountId:string,limit=100){
  const db=getD1(); const safe=Math.max(1,Math.min(300,Math.trunc(limit)));
  const result=await db.prepare(`SELECT t.id,t.transaction_number,t.savings_account_id,t.transaction_type,t.amount,t.balance_delta_amount,t.payment_method,
      t.treasury_account_id,ta.name AS treasury_name,t.reference_number,t.note,t.journal_entry_id,je.entry_number AS journal_number,
      t.original_transaction_id,t.reversal_reason,t.actor_user_id,t.occurred_at
    FROM savings_ledger_transactions t JOIN treasury_accounts ta ON ta.id=t.treasury_account_id JOIN journal_entries je ON je.id=t.journal_entry_id
    WHERE t.organization_id=? AND t.savings_account_id=? ORDER BY t.occurred_at DESC,t.created_at DESC LIMIT ${safe}`)
    .bind(organizationId,savingsAccountId).all<SavingsTransactionRow>();
  return result.results.map(r=>({...r,amount:Number(r.amount),balance_delta_amount:Number(r.balance_delta_amount)}));
}
