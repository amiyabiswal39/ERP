import { Router } from "express";
import { z } from "zod";
import { accountSchema, journalEntrySchema } from "@erp/shared";
import { prisma } from "../../lib/prisma";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { sendPdfTable } from "../../utils/export";
import { postJournalEntry } from "./ledger.service";
import { reportsService } from "./reports.service";

export const financeRouter = Router();
financeRouter.use(authenticate);

const ACCT = ["ACCOUNTANT", "MANAGER"] as const;

// ---- Currencies ----
financeRouter.get(
  "/currencies",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.currency.findMany({ orderBy: { isBase: "desc" } }));
  })
);

// Set the organization's base/display currency (super-user only).
financeRouter.patch(
  "/base-currency",
  authorize("ADMIN"),
  validate(z.object({ code: z.string().length(3) })),
  asyncHandler(async (req, res) => {
    const exists = await prisma.currency.findUnique({ where: { code: req.body.code } });
    if (!exists) throw ApiError.notFound("Currency not found");
    await prisma.$transaction([
      prisma.currency.updateMany({ data: { isBase: false } }),
      prisma.currency.update({ where: { code: req.body.code }, data: { isBase: true } }),
    ]);
    await audit(req, "settings.base-currency", "Currency", req.body.code);
    res.json({ baseCurrency: req.body.code });
  })
);

// ---- Chart of Accounts ----
financeRouter.get(
  "/accounts",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.account.findMany({ orderBy: { code: "asc" } }));
  })
);

financeRouter.post(
  "/accounts",
  authorize(...ACCT),
  validate(accountSchema),
  asyncHandler(async (req, res) => {
    const acc = await prisma.account.create({ data: req.body });
    await audit(req, "account.create", "Account", acc.id);
    res.status(201).json(acc);
  })
);

// ---- Journal entries ----
financeRouter.get(
  "/journal",
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.journalEntry.findMany({
        orderBy: { date: "desc" },
        take: 100,
        include: { lines: { include: { account: true } } },
      })
    );
  })
);

financeRouter.post(
  "/journal",
  authorize(...ACCT),
  validate(journalEntrySchema),
  asyncHandler(async (req, res) => {
    const entry = await postJournalEntry({
      date: new Date(req.body.date),
      memo: req.body.memo,
      source: "MANUAL",
      lines: req.body.lines,
    });
    await audit(req, "journal.post", "JournalEntry", entry.id);
    res.status(201).json(entry);
  })
);

// ---- Reports ----
const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

financeRouter.get(
  "/reports/profit-loss",
  validate(rangeSchema, "query"),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as any;
    res.json(await reportsService.profitAndLoss({ from, to }));
  })
);

financeRouter.get(
  "/reports/balance-sheet",
  asyncHandler(async (req, res) => {
    const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : new Date();
    res.json(await reportsService.balanceSheet(asOf));
  })
);

financeRouter.get(
  "/reports/cash-flow",
  validate(rangeSchema, "query"),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as any;
    res.json(await reportsService.cashFlow({ from, to }));
  })
);

// PDF export of P&L
financeRouter.get(
  "/reports/profit-loss/pdf",
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const pl = await reportsService.profitAndLoss({ from, to });
    const rows = [
      ...pl.revenue.map((r) => ({ section: "Revenue", name: r.name, amount: r.amount.toFixed(2) })),
      { section: "", name: "Total Revenue", amount: pl.totalRevenue.toFixed(2) },
      ...pl.expenses.map((e) => ({ section: "Expense", name: e.name, amount: e.amount.toFixed(2) })),
      { section: "", name: "Total Expenses", amount: pl.totalExpense.toFixed(2) },
      { section: "", name: "NET PROFIT", amount: pl.netProfit.toFixed(2) },
    ];
    sendPdfTable(res, "profit-and-loss", {
      title: "Profit & Loss Statement",
      subtitle: `${from?.toDateString() ?? "Inception"} – ${to?.toDateString() ?? "Today"}`,
      columns: [
        { key: "section", label: "Section", width: 120 },
        { key: "name", label: "Account", width: 280 },
        { key: "amount", label: "Amount", width: 100 },
      ],
      rows,
    });
  })
);
