import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

function monthBounds(month: string) {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export function Payroll() {
  const qc = useQueryClient();
  const canRun = useAuthStore((s) => s.hasRole("HR", "MANAGER"));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = useState("");

  const payslips = useQuery({ queryKey: ["payroll"], queryFn: async () => (await api.get("/hr/payroll")).data });

  const run = useMutation({
    mutationFn: async () => (await api.post("/hr/payroll/run", monthBounds(month))).data,
    onSuccess: (r) => { setMsg(`Generated ${r.generated} payslip(s), skipped ${r.skipped}.`); qc.invalidateQueries({ queryKey: ["payroll"] }); },
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "pay" }) =>
      (await api.post(`/hr/payslips/${id}/${action}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll"] }),
  });

  const columns: Column<any>[] = [
    { header: "Employee", cell: (p) => <span className="font-medium">{p.employee?.firstName} {p.employee?.lastName}</span> },
    { header: "Period", cell: (p) => new Date(p.periodStart).toISOString().slice(0, 7) },
    { header: "Gross", cell: (p) => formatCurrency(Number(p.grossPay)), className: "text-right" },
    { header: "Tax", cell: (p) => formatCurrency(Number(p.taxAmount)), className: "text-right" },
    { header: "Deductions", cell: (p) => formatCurrency(Number(p.totalDeductions)), className: "text-right" },
    { header: "Net", cell: (p) => <span className="font-medium">{formatCurrency(Number(p.netPay))}</span>, className: "text-right" },
    { header: "Status", cell: (p) => <Badge variant={statusVariant(p.status)}>{p.status}</Badge> },
    {
      header: "",
      cell: (p) => {
        if (!canRun) return null;
        if (p.status === "DRAFT") return <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: p.id, action: "approve" })}>Approve</Button>;
        if (p.status === "APPROVED") return <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: p.id, action: "pay" })}>Mark paid</Button>;
        return null;
      },
    },
  ];

  return (
    <>
      <PageHeader title="Payroll" subtitle="Generate payslips and post payroll to the ledger" />

      {canRun && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Run payroll</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Pay period (month)</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
            </div>
            <Button disabled={run.isPending} onClick={() => run.mutate()}>
              <Play className="h-4 w-4" /> {run.isPending ? "Running…" : "Generate payslips"}
            </Button>
            {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          </CardContent>
        </Card>
      )}

      {payslips.isLoading ? <Loading /> : <DataTable columns={columns} rows={payslips.data ?? []} empty="No payslips yet — run payroll above" />}
    </>
  );
}
