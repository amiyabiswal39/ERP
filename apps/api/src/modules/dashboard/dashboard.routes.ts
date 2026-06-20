import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { reportsService } from "../finance/reports.service";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [
      customerCount,
      employeeCount,
      assetCount,
      openInvoices,
      pl,
      cashFlow,
      receivables,
    ] = await Promise.all([
      prisma.customer.count({ where: { isActive: true } }),
      prisma.employee.count({ where: { status: "ACTIVE" } }),
      prisma.asset.count(),
      prisma.invoice.count({ where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] } } }),
      reportsService.profitAndLoss({ from: yearStart, to: now }),
      reportsService.cashFlow({ from: yearStart, to: now }),
      prisma.invoice.aggregate({ _sum: { total: true, amountPaid: true }, where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] } } }),
    ]);

    const outstanding = Number(receivables._sum.total ?? 0) - Number(receivables._sum.amountPaid ?? 0);

    res.json({
      kpis: {
        revenueYtd: pl.totalRevenue,
        expensesYtd: pl.totalExpense,
        netProfitYtd: pl.netProfit,
        cashNet: cashFlow.net,
        outstandingReceivables: outstanding,
        customerCount,
        employeeCount,
        assetCount,
        openInvoices,
      },
    });
  })
);

// Monthly revenue & expense trend (last 12 months) from the ledger
dashboardRouter.get(
  "/revenue-trend",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT to_char(je.date, 'YYYY-MM') AS month,
             SUM(CASE WHEN a.type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END) AS revenue,
             SUM(CASE WHEN a.type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END) AS expense
      FROM "JournalLine" jl
      JOIN "JournalEntry" je ON je.id = jl."entryId"
      JOIN "Account" a ON a.id = jl."accountId"
      WHERE je.date >= NOW() - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1;
    `);
    res.json(
      rows.map((r) => ({ month: r.month, revenue: Number(r.revenue), expense: Number(r.expense) }))
    );
  })
);

dashboardRouter.get(
  "/top-customers",
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.invoice.groupBy({
      by: ["customerId"],
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    });
    const customers = await prisma.customer.findMany({ where: { id: { in: grouped.map((g) => g.customerId) } } });
    const byId = new Map(customers.map((c) => [c.id, c.name]));
    res.json(grouped.map((g) => ({ customer: byId.get(g.customerId), total: Number(g._sum.total ?? 0) })));
  })
);

dashboardRouter.get(
  "/audit-logs",
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      })
    );
  })
);
