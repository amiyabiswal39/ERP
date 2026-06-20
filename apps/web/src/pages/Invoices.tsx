import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

interface Invoice {
  id: string; number: string; status: string; issueDate: string; dueDate?: string;
  total: string; amountPaid: string; currencyCode: string; customer: { name: string };
}

export function Invoices() {
  const qc = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasRole("MANAGER", "ACCOUNTANT"));
  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.get("/sales/invoices", { params: { pageSize: 50 } })).data,
  });

  const pay = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) =>
      (await api.post(`/sales/invoices/${id}/payments`, { amount, method: "BANK_TRANSFER" })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const columns: Column<Invoice>[] = [
    { header: "Invoice #", cell: (i) => <span className="font-medium">{i.number}</span> },
    { header: "Customer", cell: (i) => i.customer?.name },
    { header: "Issued", cell: (i) => formatDate(i.issueDate) },
    { header: "Due", cell: (i) => formatDate(i.dueDate) },
    { header: "Total", cell: (i) => formatCurrency(Number(i.total), i.currencyCode), className: "text-right" },
    { header: "Paid", cell: (i) => formatCurrency(Number(i.amountPaid), i.currencyCode), className: "text-right" },
    { header: "Status", cell: (i) => <Badge variant={statusVariant(i.status)}>{i.status}</Badge> },
    {
      header: "",
      cell: (i) =>
        canEdit && i.status !== "PAID" ? (
          <Button size="sm" variant="outline" disabled={pay.isPending}
            onClick={() => pay.mutate({ id: i.id, amount: Number(i.total) - Number(i.amountPaid) })}>
            Mark paid
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Sales & Invoices" subtitle="Invoices, payments and receivables" />
      {isLoading ? <Loading /> : <DataTable columns={columns} rows={data?.data ?? []} empty="No invoices yet" />}
    </>
  );
}
