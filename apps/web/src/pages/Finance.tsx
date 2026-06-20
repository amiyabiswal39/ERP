import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/shared";
import { formatCurrency } from "@/lib/utils";

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "border-t font-semibold mt-1 pt-2" : ""}`}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

export function Finance() {
  const pl = useQuery({ queryKey: ["pl"], queryFn: async () => (await api.get("/finance/reports/profit-loss")).data });
  const bs = useQuery({ queryKey: ["bs"], queryFn: async () => (await api.get("/finance/reports/balance-sheet")).data });
  const cf = useQuery({ queryKey: ["cf"], queryFn: async () => (await api.get("/finance/reports/cash-flow")).data });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await api.get("/finance/accounts")).data });

  if (pl.isLoading || bs.isLoading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Finance & Accounting"
        subtitle="Double-entry general ledger — reports derived from journal lines"
        action={
          <Button variant="outline" onClick={() => downloadFile("/finance/reports/profit-loss/pdf", "profit-and-loss.pdf")}>
            <Download className="h-4 w-4" /> P&L PDF
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profit &amp; Loss (YTD)</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="mb-1 font-medium text-muted-foreground">Revenue</p>
            {pl.data?.revenue?.map((r: any) => <Row key={r.id} label={r.name} value={r.amount} />)}
            <Row label="Total Revenue" value={pl.data?.totalRevenue ?? 0} bold />
            <p className="mb-1 mt-3 font-medium text-muted-foreground">Expenses</p>
            {pl.data?.expenses?.map((e: any) => <Row key={e.id} label={e.name} value={e.amount} />)}
            <Row label="Total Expenses" value={pl.data?.totalExpense ?? 0} bold />
            <Row label="Net Profit" value={pl.data?.netProfit ?? 0} bold />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Balance Sheet</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="mb-1 font-medium text-muted-foreground">Assets</p>
            {bs.data?.assets?.map((a: any) => <Row key={a.id} label={a.name} value={a.amount} />)}
            <Row label="Total Assets" value={bs.data?.totalAssets ?? 0} bold />
            <p className="mb-1 mt-3 font-medium text-muted-foreground">Liabilities &amp; Equity</p>
            {bs.data?.liabilities?.map((l: any) => <Row key={l.id} label={l.name} value={l.amount} />)}
            <Row label="Retained Earnings" value={bs.data?.retainedEarnings ?? 0} />
            <Row label="Total Liab. + Equity" value={(bs.data?.totalLiabilities ?? 0) + (bs.data?.totalEquity ?? 0)} bold />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cash Flow (YTD)</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <Row label="Cash Inflow" value={cf.data?.inflow ?? 0} />
            <Row label="Cash Outflow" value={cf.data?.outflow ?? 0} />
            <Row label="Net Cash" value={cf.data?.net ?? 0} bold />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Chart of Accounts</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {(accounts.data ?? []).map((a: any) => (
              <div key={a.id} className="flex justify-between border-b py-1 last:border-0">
                <span><span className="text-muted-foreground">{a.code}</span> {a.name}</span>
                <span className="text-xs text-muted-foreground">{a.type}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
