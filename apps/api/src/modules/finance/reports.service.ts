import { prisma } from "../../lib/prisma";

interface DateRange {
  from?: Date;
  to?: Date;
}

/**
 * Reports are derived entirely from journal lines grouped by account type —
 * the general ledger is the single source of truth.
 */
export const reportsService = {
  /** Net movement (debit - credit) per account within a period. */
  async accountBalances(range: DateRange) {
    const lines = await prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: {
        entry: {
          date: { gte: range.from, lte: range.to },
          isPosted: true,
        },
      },
    });
    const accounts = await prisma.account.findMany();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return lines.map((l) => {
      const acc = byId.get(l.accountId)!;
      const debit = Number(l._sum.debit ?? 0);
      const credit = Number(l._sum.credit ?? 0);
      return { account: acc, debit, credit, balance: debit - credit };
    });
  },

  /** Profit & Loss: revenue - expenses over a period. */
  async profitAndLoss(range: DateRange) {
    const balances = await this.accountBalances(range);
    const revenue = balances.filter((b) => b.account.type === "REVENUE");
    const expense = balances.filter((b) => b.account.type === "EXPENSE");
    // Revenue accounts carry credit balances; flip sign so income is positive.
    const totalRevenue = revenue.reduce((s, b) => s - b.balance, 0);
    const totalExpense = expense.reduce((s, b) => s + b.balance, 0);
    return {
      range,
      revenue: revenue.map((b) => ({ ...b.account, amount: -b.balance })),
      expenses: expense.map((b) => ({ ...b.account, amount: b.balance })),
      totalRevenue,
      totalExpense,
      netProfit: totalRevenue - totalExpense,
    };
  },

  /** Balance Sheet snapshot as of a date. */
  async balanceSheet(asOf: Date) {
    const balances = await this.accountBalances({ to: asOf });
    const pick = (type: string, flip = false) =>
      balances
        .filter((b) => b.account.type === type)
        .map((b) => ({ ...b.account, amount: flip ? -b.balance : b.balance }));

    const assets = pick("ASSET");
    const liabilities = pick("LIABILITY", true);
    const equity = pick("EQUITY", true);

    const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
    const totalEquity = equity.reduce((s, a) => s + a.amount, 0);

    // Retained earnings = net profit to date (REVENUE - EXPENSE).
    const retained =
      balances
        .filter((b) => b.account.type === "REVENUE")
        .reduce((s, b) => s - b.balance, 0) -
      balances.filter((b) => b.account.type === "EXPENSE").reduce((s, b) => s + b.balance, 0);

    return {
      asOf,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity: totalEquity + retained,
      retainedEarnings: retained,
    };
  },

  /** Cash flow proxy: net movement on cash/bank accounts (code 10xx). */
  async cashFlow(range: DateRange) {
    const cashAccounts = await prisma.account.findMany({
      where: { code: { startsWith: "10" }, type: "ASSET" },
    });
    const ids = cashAccounts.map((a) => a.id);
    const movements = await prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: { accountId: { in: ids }, entry: { date: { gte: range.from, lte: range.to } } },
    });
    const inflow = movements.reduce((s, m) => s + Number(m._sum.debit ?? 0), 0);
    const outflow = movements.reduce((s, m) => s + Number(m._sum.credit ?? 0), 0);
    return { range, inflow, outflow, net: inflow - outflow };
  },
};
