import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/asyncHandler";
import { postJournalEntry, accountIdByCode } from "../finance/ledger.service";

const round = (n: number) => Math.round(n * 100) / 100;
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

function monthlyAmount(
  method: string,
  cost: number,
  salvage: number,
  lifeMonths: number,
  bookValue: number
): number {
  if (method === "STRAIGHT_LINE") return round((cost - salvage) / lifeMonths);
  if (method === "DECLINING_BALANCE") return round(bookValue * (2 / lifeMonths)); // double-declining
  return 0;
}

export const depreciationService = {
  /** Preview the full depreciation schedule for an asset (does not write). */
  async schedule(assetId: string) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw ApiError.notFound("Asset not found");
    const life = asset.usefulLifeMonths ?? 0;
    const cost = Number(asset.purchaseCost);
    const salvage = Number(asset.salvageValue);
    if (asset.depreciationMethod === "NONE" || life <= 0) return [];

    const rows: { period: number; amount: number; bookValueAfter: number }[] = [];
    let book = cost;
    for (let m = 1; m <= life; m++) {
      let amount = monthlyAmount(asset.depreciationMethod, cost, salvage, life, book);
      if (book - amount < salvage) amount = round(book - salvage);
      if (amount <= 0) break;
      book = round(book - amount);
      rows.push({ period: m, amount, bookValueAfter: book });
    }
    return rows;
  },

  /**
   * Post the next due depreciation entry for every depreciable asset, dated to
   * the month of `asOf`. Idempotent per asset+period. Posts Dr Depreciation
   * Expense / Cr Accumulated Depreciation.
   */
  async run(asOf: Date) {
    const period = firstOfMonth(asOf);
    const assets = await prisma.asset.findMany({
      where: { depreciationMethod: { not: "NONE" }, usefulLifeMonths: { gt: 0 }, status: { not: "DISPOSED" } },
      include: { depreciation: true },
    });

    let posted = 0;
    let totalDepreciated = 0;

    for (const asset of assets) {
      const life = asset.usefulLifeMonths!;
      if (asset.depreciation.length >= life) continue; // fully depreciated
      if (asset.depreciation.some((d) => firstOfMonth(d.periodDate).getTime() === period.getTime())) continue;

      const cost = Number(asset.purchaseCost);
      const salvage = Number(asset.salvageValue);
      const accumulated = asset.depreciation.reduce((s, d) => s + Number(d.amount), 0);
      const book = round(cost - accumulated);
      if (book <= salvage) continue;

      let amount = monthlyAmount(asset.depreciationMethod, cost, salvage, life, book);
      if (book - amount < salvage) amount = round(book - salvage);
      if (amount <= 0) continue;

      await prisma.$transaction(async (tx) => {
        await tx.depreciationEntry.create({
          data: { assetId: asset.id, periodDate: period, amount, bookValueAfter: round(book - amount) },
        });
        await postJournalEntry(
          {
            date: period,
            memo: `Depreciation ${asset.tag} ${period.toISOString().slice(0, 7)}`,
            source: "DEPRECIATION",
            sourceId: asset.id,
            lines: [
              { accountId: await accountIdByCode("6300", tx), debit: amount },
              { accountId: await accountIdByCode("1600", tx), credit: amount },
            ],
          },
          tx
        );
      });
      posted++;
      totalDepreciated += amount;
    }
    return { period: period.toISOString().slice(0, 10), assetsDepreciated: posted, totalDepreciated: round(totalDepreciated) };
  },
};
