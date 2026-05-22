/** Compute payroll line amounts (ETB). */
export const calcLineAmounts = (input = {}) => {
  const base = Number(input.base_salary || 0);
  const housing = Number(input.housing_allowance || 0);
  const transport = Number(input.transport_allowance || 0);
  const otherAllow = Number(input.other_allowances || 0);
  const legacyAllow = Number(input.allowances || 0);
  const totalAllow = housing + transport + otherAllow + (legacyAllow && !housing && !transport ? legacyAllow : 0);
  const gross = base + totalAllow;

  const tax = Number(input.tax_withheld || 0);
  const pension = Number(input.pension_employee || 0);
  const otherDed = Number(input.other_deductions || 0);
  const legacyDed = Number(input.deductions || 0);
  const totalDed = tax + pension + otherDed + (legacyDed && !tax && !pension ? legacyDed : 0);
  const net = Math.max(0, gross - totalDed);

  return {
    base_salary: base,
    housing_allowance: housing,
    transport_allowance: transport,
    other_allowances: otherAllow,
    allowances: totalAllow,
    tax_withheld: tax,
    pension_employee: pension,
    other_deductions: otherDed,
    deductions: totalDed,
    gross_pay: gross,
    net_pay: net,
  };
};

/** Optional Ethiopian-style defaults (7% pension on base) — school can override per line. */
export const suggestDeductions = (baseSalary, { applyPension = false, pensionRate = 0.07 } = {}) => {
  const base = Number(baseSalary || 0);
  return {
    pension_employee: applyPension ? Math.round(base * pensionRate * 100) / 100 : 0,
    tax_withheld: 0,
  };
};

export const buildPayslipRef = (runId, staffIdNumber) => {
  const short = String(runId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  const emp = String(staffIdNumber || 'EMP').replace(/\s/g, '').slice(0, 12);
  return `PS-${short}-${emp}`;
};
