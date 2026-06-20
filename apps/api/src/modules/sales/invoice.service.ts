import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/asyncHandler";
import { postJournalEntry, accountIdByCode } from "../finance/ledger.service";
import { nextDocNumber, totalsFromItems } from "./numbering";
import type { InvoiceInput, PaymentInput, LineItemInput } from "@erp/shared";

type Tx = Prisma.TransactionClient;

/**
 * Create an invoice + post the AR/Revenue/Tax journal entry, inside a given
 * transaction. Shared by direct invoice creation and order→invoice conversion.
 */
export async function buildInvoice(
  tx: Tx,
  input: {
    customerId: string;
    salesOrderId?: string;
    issueDate?: Date;
    dueDate?: Date | null;
    currencyCode?: string;
    notes?: string;
    items: LineItemInput[];
  }
) {
  const { lines, subtotal, taxTotal, total } = totalsFromItems(input.items);
  const number = await nextDocNumber("INV", "invoice", tx);

  const invoice = await tx.invoice.create({
    data: {
      number,
      customerId: input.customerId,
      salesOrderId: input.salesOrderId,
      status: "SENT",
      issueDate: input.issueDate ?? new Date(),
      dueDate: input.dueDate ?? null,
      currencyCode: input.currencyCode ?? "USD",
      notes: input.notes,
      subtotal,
      taxTotal,
      total,
      items: {
        create: lines.map((i) => ({
          productId: i.productId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          taxRate: i.taxRate,
          lineTotal: i.lineTotal,
        })),
      },
    },
    include: { items: true },
  });

  // Double-entry: Dr Accounts Receivable, Cr Sales Revenue (+ Cr Tax Payable)
  const ar = await accountIdByCode("1100", tx);
  const revenue = await accountIdByCode("4000", tx);
  const taxPayable = await accountIdByCode("2200", tx);
  const journalLines = [
    { accountId: ar, debit: total, memo: `Invoice ${number}` },
    { accountId: revenue, credit: subtotal },
  ];
  if (taxTotal > 0) journalLines.push({ accountId: taxPayable, credit: taxTotal });

  await postJournalEntry(
    { date: invoice.issueDate, memo: `Invoice ${number}`, source: "INVOICE", sourceId: invoice.id, lines: journalLines },
    tx
  );
  return invoice;
}

export const invoiceService = {
  async list({ page, pageSize, search }: { page: number; pageSize: number; search?: string }) {
    const where = search
      ? { OR: [{ number: { contains: search, mode: "insensitive" as const } }, { customer: { name: { contains: search, mode: "insensitive" as const } } }] }
      : {};
    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { issueDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.invoice.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getById(id: string) {
    const inv = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: true, payments: true },
    });
    if (!inv) throw ApiError.notFound("Invoice not found");
    return inv;
  },

  /** Create an invoice and post AR (debit) / Revenue + Tax payable (credit). */
  async create(input: InvoiceInput) {
    return prisma.$transaction((tx) =>
      buildInvoice(tx, {
        customerId: input.customerId,
        salesOrderId: input.salesOrderId,
        issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        currencyCode: input.currencyCode,
        notes: input.notes,
        items: input.items,
      })
    );
  },

  /** Record a payment, post Cash (debit) / AR (credit), update invoice status. */
  async addPayment(invoiceId: string, input: PaymentInput) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw ApiError.notFound("Invoice not found");

      const newPaid = Number(invoice.amountPaid) + input.amount;
      if (newPaid > Number(invoice.total) + 0.005) {
        throw ApiError.badRequest("Payment exceeds invoice balance");
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: input.amount,
          method: input.method ?? "BANK_TRANSFER",
          reference: input.reference,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        },
      });

      const status = newPaid >= Number(invoice.total) - 0.005 ? "PAID" : "PARTIAL";
      await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: newPaid, status } });

      const cash = await accountIdByCode("1000", tx);
      const ar = await accountIdByCode("1100", tx);
      await postJournalEntry(
        {
          date: payment.paidAt,
          memo: `Payment for ${invoice.number}`,
          source: "PAYMENT",
          sourceId: payment.id,
          lines: [
            { accountId: cash, debit: input.amount },
            { accountId: ar, credit: input.amount },
          ],
        },
        tx
      );
      return payment;
    });
  },
};
