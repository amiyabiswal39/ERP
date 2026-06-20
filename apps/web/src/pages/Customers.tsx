import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, FileSpreadsheet, FileText, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { useAuthStore } from "@/store/auth";

interface Customer {
  id: string; name: string; company?: string; email?: string; phone?: string; isActive: boolean;
}

const blank = { name: "", company: "", email: "", phone: "" };

export function Customers() {
  const qc = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasRole("MANAGER", "ACCOUNTANT"));
  const canDelete = useAuthStore((s) => s.hasRole("MANAGER"));
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blank);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => (await api.get("/customers", { params: { search, pageSize: 50 } })).data,
  });

  const reset = () => { setShowForm(false); setEditingId(null); setForm(blank); };

  const save = useMutation({
    mutationFn: async () =>
      editingId
        ? (await api.patch(`/customers/${editingId}`, form)).data
        : (await api.post("/customers", form)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); reset(); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({ name: c.name, company: c.company ?? "", email: c.email ?? "", phone: c.phone ?? "" });
    setShowForm(true);
  };

  const columns: Column<Customer>[] = [
    { header: "Name", cell: (c) => <span className="font-medium">{c.name}</span> },
    { header: "Company", cell: (c) => c.company ?? "—" },
    { header: "Email", cell: (c) => c.email ?? "—" },
    { header: "Phone", cell: (c) => c.phone ?? "—" },
    { header: "Status", cell: (c) => <Badge variant={statusVariant(c.isActive ? "ACTIVE" : "INACTIVE")}>{c.isActive ? "Active" : "Inactive"}</Badge> },
    {
      header: "",
      className: "text-right",
      cell: (c) =>
        canEdit ? (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" onClick={() => startEdit(c)} title="Edit"><Pencil className="h-4 w-4" /></Button>
            {canDelete && (
              <Button size="icon" variant="ghost" disabled={remove.isPending}
                onClick={() => window.confirm(`Delete ${c.name}?`) && remove.mutate(c.id)} title="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers & CRM"
        subtitle="Manage your customer relationships"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadFile("/customers/export?format=csv", "customers.csv")}>
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => downloadFile("/customers/export?format=pdf", "customers.pdf")}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            {canEdit && <Button onClick={() => (showForm ? reset() : setShowForm(true))}><Plus className="h-4 w-4" /> New Customer</Button>}
          </div>
        }
      />

      {showForm && (
        <Card className="mb-4">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button disabled={!form.name || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : editingId ? "Update customer" : "Save customer"}
              </Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 max-w-sm">
        <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? <Loading /> : <DataTable columns={columns} rows={data?.data ?? []} empty="No customers yet" />}
    </>
  );
}
