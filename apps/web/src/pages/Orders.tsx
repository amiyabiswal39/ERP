import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { LineItemsEditor, LineItem, emptyLine } from "@/components/LineItemsEditor";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";

export function Orders() {
  const qc = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasRole("MANAGER", "ACCOUNTANT"));
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);
  const [currencyCode, setCurrencyCode] = useState(baseCurrency);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);

  const orders = useQuery({ queryKey: ["orders"], queryFn: async () => (await api.get("/sales/orders")).data });
  const customers = useQuery({ queryKey: ["customers-mini"], queryFn: async () => (await api.get("/customers", { params: { pageSize: 200 } })).data });
  const currencies = useQuery({ queryKey: ["currencies"], queryFn: async () => (await api.get("/finance/currencies")).data });

  const create = useMutation({
    mutationFn: async () => (await api.post("/sales/orders", { customerId, currencyCode, items })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setShowForm(false); setCustomerId(""); setCurrencyCode(baseCurrency); setItems([emptyLine()]); },
  });

  const invoice = useMutation({
    mutationFn: async (id: string) => (await api.post(`/sales/orders/${id}/invoice`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); },
  });

  const columns: Column<any>[] = [
    { header: "Order #", cell: (o) => <span className="font-medium">{o.number}</span> },
    { header: "Customer", cell: (o) => o.customer?.name },
    { header: "Date", cell: (o) => formatDate(o.orderDate ?? o.createdAt) },
    { header: "Total", cell: (o) => formatCurrency(Number(o.total), o.currencyCode), className: "text-right" },
    { header: "Invoiced", cell: (o) => o.invoices?.length ? o.invoices.map((i: any) => i.number).join(", ") : "—" },
    { header: "Status", cell: (o) => <Badge variant={statusVariant(o.status)}>{o.status}</Badge> },
    {
      header: "",
      cell: (o) =>
        canEdit && o.status !== "FULFILLED" ? (
          <Button size="sm" variant="outline" disabled={invoice.isPending} onClick={() => invoice.mutate(o.id)}>
            <FileText className="h-3 w-3" /> Generate invoice
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales Orders"
        subtitle="Confirm orders and generate invoices (posts to the ledger)"
        action={canEdit && <Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> New Order</Button>}
      />

      {showForm && (
        <Card className="mb-4">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap gap-3">
              <select
                className="h-9 w-full max-w-sm flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer…</option>
                {(customers.data?.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                title="Currency"
              >
                {(currencies.data ?? []).map((c: any) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
              </select>
            </div>
            <LineItemsEditor items={items} onChange={setItems} currency={currencyCode} />
            <Button disabled={!customerId || items.some((i) => !i.description) || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save order"}
            </Button>
          </CardContent>
        </Card>
      )}

      {orders.isLoading ? <Loading /> : <DataTable columns={columns} rows={orders.data ?? []} empty="No orders yet" />}
    </>
  );
}
