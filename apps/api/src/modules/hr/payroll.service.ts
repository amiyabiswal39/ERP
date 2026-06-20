import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/asyncHandler";
import { postJournalEntry, accountIdByCode } from "../finance/ledger.service";

const PENSION_RATE = 0.08; // employee pension/social contribution

/** Simple progressive monthly income tax. Replace with your jurisdiction's rules. */
function incomeTax(monthlyGross: number): number {
  const brackets = [
    { upTo: 1000, rate: 0 },
    { upTo: 3000, rate: 0.1 },
    { upTo: 6000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ];
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (monthlyGross <= prev) break;
    const taxable = Math.min(monthlyGross, b.upTo) - prev;
    tax += taxable * b.rate;
    prev = b.upTo;
  }
  return Math.round(tax * 100) / 100;
}

function computePayslip(gross: number) {
  const pension = Math.round(gross * PENSION_RATE * 100) / 100;
  const tax = incomeTax(gross);
  const totalDeductions = pension + tax;
  const net = Math.round((gross - totalDeductions) * 100) / 100;
  return {
    gross,
    pension,
    tax,
    totalDeductions,
    net,
    lines: [
      { type: "EARNING" as const, label: "Base Salary", amount: gross },
      { type: "DEDUCTION" as const, label: "Pension (8%)", amount: pension },
      { type: "TAX" as const, label: "Income Tax", amount: tax },
    ],
  };
}

export const payrollService = {
  list(period?: { from?: Date; to?: Date }) {
    return prisma.payslip.findMany({
      where: period?.from ? { periodStart: { gte: period.from }, periodEnd: { lte: period.to } } : undefined,
      include: { employee: { select: { firstName: true, lastName: true, employeeNo: true } }, lines: true },
      orderBy: { periodStart: "desc" },
      take: 200,
    });
  },

  /**
   * Generate draft payslips for every active employee for a pay period.
   * Idempotent: skips employees that already have a payslip for the period.
   */
  async runPayroll(periodStart: Date, periodEnd: Date) {
    const employees = await prisma.employee.findMany({ where: { status: "ACTIVE" } });
    const created: string[] = [];

    for (const emp of employees) {
      const exists = await prisma.payslip.findUnique({
        where: { employeeId_periodStart_periodEnd: { employeeId: emp.id, periodStart, periodEnd } },
      });
      if (exists) continue;

      const c = computePayslip(Number(emp.baseSalary));
      const slip = await prisma.payslip.create({
        data: {
          employeeId: emp.id,
          periodStart,
          periodEnd,
          grossPay: c.gross,
          totalDeductions: c.totalDeductions,
          taxAmount: c.tax,
          netPay: c.net,
          status: "DRAFT",
          lines: { create: c.lines },
        },
      });
      created.push(slip.id);
    }
    return { generated: created.length, skipped: employees.length - created.length };
  },

  async approve(payslipId: string) {
    const slip = await prisma.payslip.findUnique({ where: { id: payslipId } });
    if (!slip) throw ApiError.notFound("Payslip not found");
    if (slip.status !== "DRAFT") throw ApiError.badRequest("Only draft payslips can be approved");
    return prisma.payslip.update({ where: { id: payslipId }, data: { status: "APPROVED" } });
  },

  /** Mark a payslip paid and post the payroll journal entry. */
  async markPaid(payslipId: string) {
    return prisma.$transaction(async (tx) => {
      const slip = await tx.payslip.findUnique({ where: { id: payslipId } });
      if (!slip) throw ApiError.notFound("Payslip not found");
      if (slip.status === "PAID") throw ApiError.badRequest("Payslip already paid");

      const gross = Number(slip.grossPay);
      const tax = Number(slip.taxAmount);
      const net = Number(slip.netPay);
      const otherDeductions = Number(slip.totalDeductions) - tax;

      // Dr Salaries Expense (gross); Cr Cash (net), Tax Payable (tax), Deductions Payable (rest)
      const lines = [
        { accountId: await accountIdByCode("6000", tx), debit: gross, memo: "Payroll" },
        { accountId: await accountIdByCode("1000", tx), credit: net },
      ];
      if (tax > 0) lines.push({ accountId: await accountIdByCode("2200", tx), credit: tax });
      if (otherDeductions > 0) lines.push({ accountId: await accountIdByCode("2300", tx), credit: otherDeductions });

      await postJournalEntry(
        { date: new Date(), memo: `Payroll ${slip.periodStart.toISOString().slice(0, 7)}`, source: "PAYROLL", sourceId: slip.id, lines },
        tx
      );
      return tx.payslip.update({ where: { id: payslipId }, data: { status: "PAID" } });
    });
  },
};
