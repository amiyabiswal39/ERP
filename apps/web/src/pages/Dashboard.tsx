import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, Users, FileText, Boxes } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Loading } from "@/components/shared";
import { formatCurrency, formatDate } from "@/lib/utils";

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ElementType; accent?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const summary = useQuery({ queryKey: ["dash-summary"], queryFn: async () => (await api.get("/dashboard/summary")).data });
  const trend = useQuery({ queryKey: ["dash-trend"], queryFn: async () => (await api.get("/dashboard/revenue-trend")).data });
  const top = useQuery({ queryKey: ["dash-top"], queryFn: async () => (await api.get("/dashboard/top-customers")).data });
  const logs = useQuery({ queryKey: ["dash-logs"], queryFn: async () => (await api.get("/dashboard/audit-logs")).data });

  if (summary.isLoading) return <Loading />;
  const k = summary.data?.kpis ?? {};

  return (
    <>
      <PageHeader title="Business Dashboard" subtitle="Real-time overview of your company performance" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue (YTD)" value={formatCurrency(k.revenueYtd)} icon={TrendingUp} accent="bg-green-500/15 text-green-600" />
        <Kpi label="Expenses (YTD)" value={formatCurrency(k.expensesYtd)} icon={TrendingDown} accent="bg-amber-500/15 text-amber-600" />
        <Kpi label="Net Profit (YTD)" value={formatCurrency(k.netProfitYtd)} icon={Wallet} accent="bg-primary/10 text-primary" />
        <Kpi label="Receivables" value={formatCurrency(k.outstandingReceivables)} icon={FileText} accent="bg-blue-500/15 text-blue-600" />
        <Kpi label="Customers" value={String(k.customerCount ?? 0)} icon={Users} />
        <Kpi label="Employees" value={String(k.employeeCount ?? 0)} icon={Users} />
        <Kpi label="Assets" value={String(k.assetCount ?? 0)} icon={Boxes} />
        <Kpi label="Open Invoices" value={String(k.openInvoices ?? 0)} icon={FileText} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Revenue vs Expenses (12 mo)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.data ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="url(#rev)" />
                <Area type="monotone" dataKey="expense" stroke="#f59e0b" fillOpacity={0.1} fill="#f59e0b" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Customers</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top.data ?? []} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="customer" width={90} fontSize={11} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Recent Activity (Audit Log)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {(logs.data ?? []).slice(0, 8).map((l: any) => (
              <div key={l.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <span><span className="font-medium">{l.action}</span> on {l.entity}</span>
                <span className="text-muted-foreground">
                  {l.user ? `${l.user.firstName} ${l.user.lastName}` : "system"} · {formatDate(l.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
