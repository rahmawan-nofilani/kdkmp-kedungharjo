export type LoanProductEligibilityConfig = {
  id: string;
  product_id: string;
  version: number;
  status: string;
  display_name: string;
  min_principal_amount: number;
  max_principal_amount: number;
  min_tenor_months: number;
  max_tenor_months: number;
  installment_frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  interest_method: "FLAT" | "EFFECTIVE" | "ANNUITY";
  interest_rate_bps: number;
  admin_fee_amount: number;
  provision_fee_bps: number;
  grace_period_days: number;
  late_penalty_bps_per_day: number;
  late_penalty_min_amount: number;
  min_membership_months: number;
  min_savings_balance_amount: number;
  max_active_loans: number;
  max_dsr_bps: number;
  collateral_required: boolean;
  guarantor_required: boolean;
  repayment_channels: string[];
  disbursement_channels: string[];
  disbursement_accounting_event_code: string;
  principal_accounting_event_code: string;
  interest_accounting_event_code: string;
  penalty_accounting_event_code: string;
  effective_from: string | null;
  effective_to: string | null;
};

export type EligibilityCheck = {
  code: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type LoanEligibilityInput = {
  applicationId: string;
  principalAmount: number;
  tenorMonths: number;
  monthlyIncomeAmount: number;
  monthlyObligationAmount: number;
  collateralNote: string | null;
  guarantorNote: string | null;
  memberStatus: string;
  membershipMonths: number;
  savingsBalanceAmount: number;
  openCommitments: number;
  d1Current: boolean;
  observedAt: string;
  jakartaDate: string;
  productCode: string;
  productStatus: string;
  currentApprovedVersion: number;
  product: LoanProductEligibilityConfig;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function periodsPerYear(frequency: LoanProductEligibilityConfig["installment_frequency"]) {
  if (frequency === "WEEKLY") return 52;
  if (frequency === "BIWEEKLY") return 26;
  return 12;
}

function projectedInstallment(principal: number, tenorMonths: number, product: LoanProductEligibilityConfig) {
  const perYear = periodsPerYear(product.installment_frequency);
  const periods = Math.max(1, Math.ceil((tenorMonths * perYear) / 12));
  const annualRate = product.interest_rate_bps / 10_000;
  const periodRate = annualRate / perYear;
  let installment = principal / periods;

  if (product.interest_method === "FLAT") {
    installment = (principal + principal * annualRate * (tenorMonths / 12)) / periods;
  } else if (product.interest_method === "EFFECTIVE") {
    installment = principal / periods + principal * periodRate;
  } else if (periodRate > 0) {
    installment = principal * periodRate / (1 - Math.pow(1 + periodRate, -periods));
  }

  const rounded = Math.max(0, Math.ceil(installment));
  return {
    periods,
    periodsPerYear: perYear,
    installmentAmount: rounded,
    monthlyCommitmentAmount: Math.max(0, Math.ceil((rounded * perYear) / 12)),
  };
}

export function membershipMonthsSince(memberSince: string, observedAt: string) {
  const [startYear, startMonth, startDay] = memberSince.split("-").map(Number);
  const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(observedAt));
  const [endYear, endMonth, endDay] = jakartaDate.split("-").map(Number);
  if (![startYear, startMonth, startDay, endYear, endMonth, endDay].every(Number.isFinite)) return 0;
  let months = (endYear - startYear) * 12 + endMonth - startMonth;
  if (endDay < startDay) months -= 1;
  return Math.max(0, months);
}

export function evaluateLoanEligibility(input: LoanEligibilityInput) {
  const projection = projectedInstallment(input.principalAmount, input.tenorMonths, input.product);
  const debtAfterLoan = input.monthlyObligationAmount + projection.monthlyCommitmentAmount;
  const dsrBps = input.monthlyIncomeAmount > 0 ? Math.round((debtAfterLoan / input.monthlyIncomeAmount) * 10_000) : 1_000_000;
  const notePresent = (value: string | null) => Boolean(value && value.trim().length >= 5);
  const effective = (!input.product.effective_from || input.jakartaDate >= input.product.effective_from)
    && (!input.product.effective_to || input.jakartaDate <= input.product.effective_to);

  const checks: EligibilityCheck[] = [
    { code: "D1_CURRENT", label: "Ledger simpanan siap", passed: input.d1Current, detail: input.d1Current ? "D1 savings_ledger_v11 tersedia." : "D1 savings_ledger_v11 belum CURRENT." },
    { code: "MEMBER_ACTIVE", label: "Status anggota", passed: input.memberStatus === "ACTIVE", detail: input.memberStatus === "ACTIVE" ? "Anggota berstatus ACTIVE." : `Status anggota ${input.memberStatus}.` },
    { code: "MEMBERSHIP_MONTHS", label: "Lama keanggotaan", passed: input.membershipMonths >= input.product.min_membership_months, detail: `${input.membershipMonths} bulan; minimum ${input.product.min_membership_months} bulan.` },
    { code: "PRODUCT_CURRENT", label: "Versi produk aktif", passed: input.productStatus === "ACTIVE" && input.product.status === "APPROVED" && input.currentApprovedVersion === input.product.version, detail: `Produk ${input.productStatus}; versi v${input.product.version} ${input.product.status}.` },
    { code: "EFFECTIVE_DATE", label: "Masa berlaku produk", passed: effective, detail: effective ? "Produk berlaku pada tanggal pemeriksaan." : "Produk belum atau tidak lagi berlaku." },
    { code: "PRINCIPAL_RANGE", label: "Plafon pengajuan", passed: input.principalAmount >= input.product.min_principal_amount && input.principalAmount <= input.product.max_principal_amount, detail: `${rupiah(input.principalAmount)} dalam rentang ${rupiah(input.product.min_principal_amount)}–${rupiah(input.product.max_principal_amount)}.` },
    { code: "TENOR_RANGE", label: "Tenor pengajuan", passed: input.tenorMonths >= input.product.min_tenor_months && input.tenorMonths <= input.product.max_tenor_months, detail: `${input.tenorMonths} bulan; rentang ${input.product.min_tenor_months}–${input.product.max_tenor_months} bulan.` },
    { code: "SAVINGS_BALANCE", label: "Saldo simpanan minimum", passed: input.d1Current && input.savingsBalanceAmount >= input.product.min_savings_balance_amount, detail: `${rupiah(input.savingsBalanceAmount)}; minimum ${rupiah(input.product.min_savings_balance_amount)}.` },
    { code: "ACTIVE_LIMIT", label: "Batas komitmen aktif", passed: input.openCommitments < input.product.max_active_loans, detail: `${input.openCommitments} komitmen terbuka; maksimum ${input.product.max_active_loans}.` },
    { code: "DSR", label: "Rasio kewajiban (DSR)", passed: dsrBps <= input.product.max_dsr_bps, detail: `${(dsrBps / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%; maksimum ${(input.product.max_dsr_bps / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%.` },
    { code: "COLLATERAL", label: "Catatan agunan", passed: !input.product.collateral_required || notePresent(input.collateralNote), detail: input.product.collateral_required ? (notePresent(input.collateralNote) ? "Catatan agunan tersedia." : "Catatan agunan wajib diisi.") : "Agunan tidak diwajibkan produk." },
    { code: "GUARANTOR", label: "Catatan penjamin", passed: !input.product.guarantor_required || notePresent(input.guarantorNote), detail: input.product.guarantor_required ? (notePresent(input.guarantorNote) ? "Catatan penjamin tersedia." : "Catatan penjamin wajib diisi.") : "Penjamin tidak diwajibkan produk." },
  ];
  const passed = checks.every((check) => check.passed);

  return {
    status: passed ? "PASS" as const : "FAIL" as const,
    projectedInstallmentAmount: projection.installmentAmount,
    projectedMonthlyCommitmentAmount: projection.monthlyCommitmentAmount,
    calculatedDsrBps: dsrBps,
    productSnapshot: {
      schema_version: "loan_product_snapshot_v1",
      captured_at: input.observedAt,
      product_code: input.productCode,
      product_version_id: input.product.id,
      version: input.product.version,
      display_name: input.product.display_name,
      installment_frequency: input.product.installment_frequency,
      interest_method: input.product.interest_method,
      interest_rate_bps: input.product.interest_rate_bps,
      admin_fee_amount: input.product.admin_fee_amount,
      provision_fee_bps: input.product.provision_fee_bps,
      grace_period_days: input.product.grace_period_days,
      late_penalty_bps_per_day: input.product.late_penalty_bps_per_day,
      late_penalty_min_amount: input.product.late_penalty_min_amount,
      min_membership_months: input.product.min_membership_months,
      min_savings_balance_amount: input.product.min_savings_balance_amount,
      max_active_loans: input.product.max_active_loans,
      max_dsr_bps: input.product.max_dsr_bps,
      collateral_required: input.product.collateral_required,
      guarantor_required: input.product.guarantor_required,
      repayment_channels: Array.isArray(input.product.repayment_channels) ? [...input.product.repayment_channels] : [],
      disbursement_channels: Array.isArray(input.product.disbursement_channels) ? [...input.product.disbursement_channels] : [],
      disbursement_accounting_event_code: input.product.disbursement_accounting_event_code,
      principal_accounting_event_code: input.product.principal_accounting_event_code,
      interest_accounting_event_code: input.product.interest_accounting_event_code,
      penalty_accounting_event_code: input.product.penalty_accounting_event_code,
    },
    eligibilitySnapshot: {
      schema_version: "loan_eligibility_v1",
      application_id: input.applicationId,
      observed_at: input.observedAt,
      d1_schema: input.d1Current ? "savings_ledger_v11" : "unavailable",
      membership_months: input.membershipMonths,
      savings_balance_amount: input.savingsBalanceAmount,
      open_commitments: input.openCommitments,
      periods: projection.periods,
      periods_per_year: projection.periodsPerYear,
      checks,
    },
  };
}
