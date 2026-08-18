export type LoanInstallmentFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
export type LoanInterestMethod = "FLAT" | "EFFECTIVE" | "ANNUITY";

export type LoanScheduleInput = {
  principalAmount: number;
  tenorMonths: number;
  installmentFrequency: LoanInstallmentFrequency;
  interestMethod: LoanInterestMethod;
  interestRateBps: number;
  referenceDate: string;
  adminFeeAmount?: number;
  provisionFeeBps?: number;
};

export type LoanScheduleRow = {
  period: number;
  dueDate: string;
  openingPrincipalAmount: number;
  principalAmount: number;
  interestAmount: number;
  installmentAmount: number;
  closingPrincipalAmount: number;
};

export type LoanScheduleResult = {
  schemaVersion: "loan_schedule_preview_v1";
  periods: number;
  periodsPerYear: number;
  firstDueDate: string;
  principalAmount: number;
  totalPrincipalAmount: number;
  totalInterestAmount: number;
  totalInstallmentAmount: number;
  adminFeeAmount: number;
  provisionFeeAmount: number;
  totalUpfrontFeeAmount: number;
  rows: LoanScheduleRow[];
};

function integer(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function periodsPerYear(frequency: LoanInstallmentFrequency) {
  if (frequency === "WEEKLY") return 52;
  if (frequency === "BIWEEKLY") return 26;
  return 12;
}

function parseDate(value: string) {
  const dateOnly = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) throw new Error("INVALID_REFERENCE_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("INVALID_REFERENCE_DATE");
  }
  return date;
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first;
}

function dueDate(reference: Date, frequency: LoanInstallmentFrequency, period: number) {
  if (frequency === "WEEKLY") return addDays(reference, 7 * period);
  if (frequency === "BIWEEKLY") return addDays(reference, 14 * period);
  return addMonths(reference, period);
}

function allocation(total: number, periods: number, period: number) {
  const base = Math.floor(total / periods);
  const remainder = total - base * periods;
  return base + (period <= remainder ? 1 : 0);
}

export function buildLoanSchedule(input: LoanScheduleInput): LoanScheduleResult {
  const principal = integer(input.principalAmount);
  const tenorMonths = integer(input.tenorMonths);
  const interestRateBps = integer(input.interestRateBps);
  const adminFeeAmount = integer(input.adminFeeAmount ?? 0);
  const provisionFeeBps = integer(input.provisionFeeBps ?? 0);
  if (principal <= 0) throw new Error("INVALID_PRINCIPAL");
  if (tenorMonths <= 0 || tenorMonths > 360) throw new Error("INVALID_TENOR");

  const perYear = periodsPerYear(input.installmentFrequency);
  const periods = Math.max(1, Math.ceil((tenorMonths * perYear) / 12));
  const annualRate = interestRateBps / 10_000;
  const periodRate = annualRate / perYear;
  const referenceDate = parseDate(input.referenceDate);
  const rows: LoanScheduleRow[] = [];
  let openingPrincipal = principal;

  let flatInterestTotal = 0;
  if (input.interestMethod === "FLAT") {
    flatInterestTotal = integer(principal * annualRate * (tenorMonths / 12));
  }

  let annuityPayment = 0;
  if (input.interestMethod === "ANNUITY") {
    annuityPayment = periodRate > 0
      ? integer(principal * periodRate / (1 - Math.pow(1 + periodRate, -periods)))
      : integer(principal / periods);
  }

  for (let period = 1; period <= periods; period += 1) {
    let principalAmount = 0;
    let interestAmount = 0;

    if (input.interestMethod === "FLAT") {
      principalAmount = allocation(principal, periods, period);
      interestAmount = allocation(flatInterestTotal, periods, period);
    } else if (input.interestMethod === "EFFECTIVE") {
      principalAmount = period === periods ? openingPrincipal : Math.min(openingPrincipal, allocation(principal, periods, period));
      interestAmount = integer(openingPrincipal * periodRate);
    } else {
      interestAmount = integer(openingPrincipal * periodRate);
      principalAmount = period === periods
        ? openingPrincipal
        : Math.min(openingPrincipal, Math.max(0, annuityPayment - interestAmount));
      if (principalAmount <= 0 && openingPrincipal > 0) {
        principalAmount = Math.min(openingPrincipal, allocation(principal, periods, period));
      }
    }

    principalAmount = Math.min(openingPrincipal, integer(principalAmount));
    const installmentAmount = principalAmount + interestAmount;
    const closingPrincipalAmount = Math.max(0, openingPrincipal - principalAmount);

    rows.push({
      period,
      dueDate: formatDate(dueDate(referenceDate, input.installmentFrequency, period)),
      openingPrincipalAmount: openingPrincipal,
      principalAmount,
      interestAmount,
      installmentAmount,
      closingPrincipalAmount,
    });
    openingPrincipal = closingPrincipalAmount;
  }

  if (openingPrincipal > 0 && rows.length) {
    const last = rows[rows.length - 1];
    last.principalAmount += openingPrincipal;
    last.installmentAmount += openingPrincipal;
    last.closingPrincipalAmount = 0;
  }

  const totalPrincipalAmount = rows.reduce((sum, row) => sum + row.principalAmount, 0);
  const totalInterestAmount = rows.reduce((sum, row) => sum + row.interestAmount, 0);
  const totalInstallmentAmount = rows.reduce((sum, row) => sum + row.installmentAmount, 0);
  const provisionFeeAmount = integer((principal * provisionFeeBps) / 10_000);

  return {
    schemaVersion: "loan_schedule_preview_v1",
    periods,
    periodsPerYear: perYear,
    firstDueDate: rows[0]?.dueDate || formatDate(referenceDate),
    principalAmount: principal,
    totalPrincipalAmount,
    totalInterestAmount,
    totalInstallmentAmount,
    adminFeeAmount,
    provisionFeeAmount,
    totalUpfrontFeeAmount: adminFeeAmount + provisionFeeAmount,
    rows,
  };
}
