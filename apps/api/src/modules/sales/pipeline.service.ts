import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/asyncHandler";
import { nextDocNumber, totalsFromItems } from "./numbering";
import { buildInvoice } from "./invoice.service";
import type { QuoteInput, SalesOrderInput, LineItemInput } from "@erp/shared";

const itemCreate = (
  lines: {
    productId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }[]
) =>
  lines.map((i) => ({
    productId: i.productId,
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    taxRate: i.taxRate,
    lineTotal: i.lineTotal,
  }));

// ---------------- Quotes ----------------
export const quoteService = {
  list() {
    return prisma.quote.findMany({
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async get(id: string) {
    const q = await prisma.quote.findUnique({ where: { id }, include: { customer: true, items: true } });
    if (!q) throw ApiError.notFound("Quote not found");
    return q;
  },

  async create(input: QuoteInput) {
    const { lines, subtotal, taxTotal, total } = totalsFromItems(input.items);
    return prisma.quote.create({
      data: {
        number: await nextDocNumber("QUO", "quote"),
        customerId: input.customerId,
        status: "DRAFT",
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        currencyCode: input.currencyCode ?? "USD",
        notes: input.notes,
        subtotal,
        taxTotal,
        total,
        items: { create: itemCreate(lines) },
      },
      include: { items: true },
    });
  },

  /** Accept a quote and spawn a Sales Order carrying its line items forward. */
  async convertToOrder(quoteId: string) {
    return prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { items: true } });
      if (!quote) throw ApiError.notFound("Quote not found");
      if (quote.status === "ACCEPTED") throw ApiError.badRequest("Quote already converted");

      const items: LineItemInput[] = quote.items.map((i) => ({
        productId: i.productId ?? undefined,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        taxRate: Number(i.taxRate),
      }));
      const { lines, subtotal, taxTotal, total } = totalsFromItems(items);

      const order = await tx.salesOrder.create({
        data: {
          number: await nextDocNumber("SO", "salesOrder", tx),
          customerId: quote.customerId,
          status: "CONFIRMED",
          currencyCode: quote.currencyCode,
          notes: `From quote ${quote.number}`,
          subtotal,
          taxTotal,
          total,
          items: { create: itemCreate(lines) },
        },
        include: { items: true },
      });

      await tx.quote.update({ where: { id: quoteId }, data: { status: "ACCEPTED" } });
      return order;
    });
  },
};

// ---------------- Sales Orders ----------------
export const orderService = {
  list() {
    return prisma.salesOrder.findMany({
      include: { customer: { select: { name: true } }, invoices: { select: { id: true, number: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async get(id: string) {
    const o = await prisma.salesOrder.findUnique({ where: { id }, include: { customer: true, items: true, invoices: true } });
    if (!o) throw ApiError.notFound("Sales order not found");
    return o;
  },

  async create(input: SalesOrderInput) {
    const { lines, subtotal, taxTotal, total } = totalsFromItems(input.items);
    return prisma.salesOrder.create({
      data: {
        number: await nextDocNumber("SO", "salesOrder"),
        customerId: input.customerId,
        status: "PENDING",
        currencyCode: input.currencyCode ?? "USD",
        notes: input.notes,
        subtotal,
        taxTotal,
        total,
        items: { create: itemCreate(lines) },
      },
      include: { items: true },
    });
  },

  /** Generate an invoice from an order (reuses the ledger-posting builder). */
  async convertToInvoice(orderId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw ApiError.notFound("Sales order not found");

      const items: LineItemInput[] = order.items.map((i) => ({
        productId: i.productId ?? undefined,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        taxRate: Number(i.taxRate),
      }));

      const invoice = await buildInvoice(tx, {
        customerId: order.customerId,
        salesOrderId: order.id,
        currencyCode: order.currencyCode,
        items,
        notes: `From order ${order.number}`,
      });

      await tx.salesOrder.update({ where: { id: orderId }, data: { status: "FULFILLED" } });
      return invoice;
    });
  },
};
