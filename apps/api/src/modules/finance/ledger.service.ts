import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/asyncHandler";

type Tx = Prisma.TransactionClient;

/**
 * Post a balanced double-entry journal entry. Throws if debits != credits.
 * Pass a transaction client when posting inside a larger transaction.
 */
export async function postJournalEntry(
  data: {
    date: Date;
    memo?: string;
    source?: "MANUAL" | "INVOICE" | "PAYMENT" | "PAYROLL" | "DEPRECIATION" | "EXPENSE";
    sourceId?: string;
    lines: { accountId: string; debit?: number; credit?: number; memo?: string }[];
  },
  client: Tx = prisma as unknown as Tx
) {
  const totalDebit = data.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = data.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw ApiError.badRequest(
      `Journal entry does not balance (debits ${totalDebit} != credits ${totalCredit})`
    );
  }
  return client.journalEntry.create({
    data: {
      date: data.date,
      memo: data.memo,
      source: data.source ?? "MANUAL",
      sourceId: data.sourceId,
      lines: {
        create: data.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          memo: l.memo,
        })),
      },
    },
    include: { lines: true },
  });
}

/** Resolve an account id by its code (e.g. "1000"). Cached per process. */
const codeCache = new Map<string, string>();
export async function accountIdByCode(code: string, client: Tx = prisma as unknown as Tx) {
  if (codeCache.has(code)) return codeCache.get(code)!;
  const acc = await client.account.findUnique({ where: { code } });
  if (!acc) throw ApiError.badRequest(`Chart of Accounts missing required account code ${code}`);
  codeCache.set(code, acc.id);
  return acc.id;
}
