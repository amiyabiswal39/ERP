import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { LineItemsEditor, LineItem, emptyLine } from "@/components/LineItemsEditor";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";

export function Quotes() {
  const qc = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasRole("MANAGER", "ACCOUNTANT"));
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);
  const [currencyCode, setCurrencyCode] = useState(baseCurrency);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);

  const quotes = useQuery({ queryKey: ["quotes"], queryFn: async () => (await api.get("/sales/quotes")).data });
  const customers = useQuery({ queryKey: ["customers-mini"], queryFn: async () => (await api.get("/customers", { params: { pageSize: 200 } })).data });
  const currencies = useQuery({ queryKey: ["currencies"], queryFn: async () => (await api.get("/finance/currencies")).data });

  const create = useMutation({
    mutationFn: async () => (await api.post("/sales/quotes", { customerId, currencyCode, items })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setShowForm(false); setCustomerId(""); setCurrencyCode(baseCurrency); setItems([emptyLine()]);
    },
  });

  const convert = useMutation({
    mutationFn: async (id: string) => (await api.post(`/sales/quotes/${id}/convert`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const columns: Column<any>[] = [
    { header: "Quote #", cell: (q) => <span className="font-medium">{q.number}</span> },
    { header: "Customer", cell: (q) => q.customer?.name },
    { header: "Date", cell: (q) => formatDate(q.createdAt) },
    { header: "Total", cell: (q) => formatCurrency(Number(q.total), q.currencyCode), className: "text-right" },
    { header: "Status", cell: (q) => <Badge variant={statusVariant(q.status)}>{q.status}</Badge> },
    {
      header: "",
      cell: (q) =>
        canEdit && q.status !== "ACCEPTED" ? (
          <Button size="sm" variant="outline" disabled={convert.isPending} onClick={() => convert.mutate(q.id)}>
            Convert to order <ArrowRight className="h-3 w-3" />
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotes"
        subtitle="Create quotes and convert won deals into sales orders"
        action={canEdit && <Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> New Quote</Button>}
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
              {create.isPending ? "Saving…" : "Save quote"}
            </Button>
          </CardContent>
        </Card>
      )}

      {quotes.isLoading ? <Loading /> : <DataTable columns={columns} rows={quotes.data ?? []} empty="No quotes yet" />}
    </>
  );
}
