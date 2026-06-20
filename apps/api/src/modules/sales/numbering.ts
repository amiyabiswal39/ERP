import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type Tx = Prisma.TransactionClient;
type Numbered = "invoice" | "salesOrder" | "quote";

/** Sequential, zero-padded document number, e.g. INV-00007. */
export async function nextDocNumber(
  prefix: string,
  model: Numbered,
  client: Tx = prisma as unknown as Tx
): Promise<string> {
  const count = await (client[model] as any).count();
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

/** Compute totals for a set of line items (shared by quote/order/invoice). */
export function totalsFromItems<T extends { quantity: number; unitPrice: number; taxRate?: number }>(
  items: T[]
) {
  const lines = items.map((i) => {
    const net = i.quantity * i.unitPrice;
    const tax = (net * (i.taxRate ?? 0)) / 100;
    return { ...i, taxRate: i.taxRate ?? 0, net, tax, lineTotal: net + tax };
  });
  const subtotal = lines.reduce((s, l) => s + l.net, 0);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0);
  return { lines, subtotal, taxTotal, total: subtotal + taxTotal };
}
