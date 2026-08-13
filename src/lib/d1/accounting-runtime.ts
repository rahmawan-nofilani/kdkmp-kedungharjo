import { getActiveAccountingMapping } from "./accounting-config";
import { getD1 } from "./context";

const FOUNDATION_RUNTIME_MAPPING: Record<string, { debit_code: string; credit_code: string }> = {
  POS_CASH_REVENUE: { debit_code: "1-1000", credit_code: "4-1000" },
  POS_COGS: { debit_code: "5-1000", credit_code: "1-1300" },
  PURCHASE_RECEIPT: { debit_code: "1-1300", credit_code: "2-1500" },
  SUPPLIER_INVOICE_APPROVED: { debit_code: "2-1500", credit_code: "2-1000" },
  SUPPLIER_PAYMENT_BANK: { debit_code: "2-1000", credit_code: "1-1100" },
  SUPPLIER_PAYMENT_CASH: { debit_code: "2-1000", credit_code: "1-1000" },
};

export async function resolveAccountingMapping(organizationId: string, eventCode: string) {
  const fallback = FOUNDATION_RUNTIME_MAPPING[eventCode];
  if (!fallback) throw new Error(`Accounting event ${eventCode} belum memiliki foundation mapping.`);

  const db = getD1();
  const marker = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version='accounting_config_v5' LIMIT 1")
    .first<{ version: string }>();

  if (!marker?.version) {
    return {
      event_code: eventCode,
      version: 0,
      debit_code: fallback.debit_code,
      credit_code: fallback.credit_code,
      source: "FOUNDATION_FALLBACK" as const,
    };
  }

  const active = await getActiveAccountingMapping(organizationId, eventCode);
  if (!active) {
    throw new Error(`Accounting mapping APPROVED untuk ${eventCode} tidak tersedia atau memakai akun nonaktif.`);
  }

  return {
    event_code: active.event_code,
    version: Number(active.version),
    debit_code: active.debit_code,
    credit_code: active.credit_code,
    source: "APPROVED_MAPPING" as const,
  };
}
