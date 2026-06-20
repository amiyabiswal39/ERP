import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Pencil, Trash2, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

const blankAsset = {
  tag: "", name: "", category: "", serialNumber: "", location: "",
  purchaseDate: "", purchaseCost: "", salvageValue: "", usefulLifeMonths: "",
  depreciationMethod: "STRAIGHT_LINE",
};

interface Asset {
  id: string; tag: string; name: string; category?: string; status: string;
  purchaseCost: string; purchaseDate?: string;
  assignments: { employee?: { firstName: string; lastName: string }; department?: { name: string } }[];
}

export function Assets() {
  const qc = useQueryClient();
  const canRun = useAuthStore((s) => s.hasRole("MANAGER", "ACCOUNTANT"));
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState({ employeeId: "", departmentId: "" });
  const [form, setForm] = useState(blankAsset);
  const [error, setError] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get("/assets", { params: { pageSize: 50 } })).data,
  });
  const employees = useQuery({ queryKey: ["employees-mini"], queryFn: async () => (await api.get("/hr/employees", { params: { pageSize: 200 } })).data });
  const departments = useQuery({ queryKey: ["departments"], queryFn: async () => (await api.get("/hr/departments")).data });

  const reset = () => { setShowForm(false); setEditingId(null); setForm(blankAsset); setError(""); };

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        tag: form.tag,
        name: form.name,
        depreciationMethod: form.depreciationMethod,
        purchaseCost: Number(form.purchaseCost) || 0,
        salvageValue: Number(form.salvageValue) || 0,
      };
      if (form.category) payload.category = form.category;
      if (form.serialNumber) payload.serialNumber = form.serialNumber;
      if (form.location) payload.location = form.location;
      if (form.usefulLifeMonths) payload.usefulLifeMonths = Number(form.usefulLifeMonths);
      if (form.purchaseDate) payload.purchaseDate = new Date(form.purchaseDate).toISOString();
      return editingId
        ? (await api.patch(`/assets/${editingId}`, payload)).data
        : (await api.post("/assets", payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); reset(); },
    onError: (e: any) => setError(e?.response?.data?.error ?? "Failed to save asset"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });

  const assign = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (assignTo.employeeId) body.employeeId = assignTo.employeeId;
      if (assignTo.departmentId) body.departmentId = assignTo.departmentId;
      return (await api.post(`/assets/${assigningId}/assign`, body)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); setAssigningId(null); setAssignTo({ employeeId: "", departmentId: "" }); },
  });

  const startEdit = (a: any) => {
    setEditingId(a.id);
    setForm({
      tag: a.tag, name: a.name, category: a.category ?? "", serialNumber: a.serialNumber ?? "",
      location: a.location ?? "", purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : "",
      purchaseCost: String(a.purchaseCost ?? ""), salvageValue: String(a.salvageValue ?? ""),
      usefulLifeMonths: a.usefulLifeMonths ? String(a.usefulLifeMonths) : "",
      depreciationMethod: a.depreciationMethod ?? "STRAIGHT_LINE",
    });
    setShowForm(true);
  };

  const runDep = useMutation({
    mutationFn: async () => (await api.post("/assets/depreciation/run", {})).data,
    onSuccess: (r) => {
      setMsg(`Depreciated ${r.assetsDepreciated} asset(s) for ${r.period} · ${formatCurrency(r.totalDepreciated)} posted.`);
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const valid = form.tag && form.name;

  const columns: Column<Asset>[] = [
    { header: "Tag", cell: (a) => <span className="font-medium">{a.tag}</span> },
    { header: "Name", cell: (a) => a.name },
    { header: "Category", cell: (a) => a.category ?? "—" },
    { header: "Cost", cell: (a) => formatCurrency(Number(a.purchaseCost)), className: "text-right" },
    { header: "Purchased", cell: (a) => formatDate(a.purchaseDate) },
    {
      header: "Assigned to",
      cell: (a) => {
        const cur = a.assignments?.[0];
        if (!cur) return "—";
        return cur.employee ? `${cur.employee.firstName} ${cur.employee.lastName}` : cur.department?.name ?? "—";
      },
    },
    { header: "Status", cell: (a) => <Badge variant={statusVariant(a.status)}>{a.status.replace("_", " ")}</Badge> },
    {
      header: "",
      className: "text-right",
      cell: (a) =>
        canRun ? (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" onClick={() => { setAssigningId(a.id); setAssignTo({ employeeId: "", departmentId: "" }); }} title="Assign"><UserCheck className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => startEdit(a)} title="Edit"><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={remove.isPending}
              onClick={() => window.confirm(`Delete asset ${a.tag}?`) && remove.mutate(a.id)} title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const assigningAsset = (data?.data ?? []).find((a: Asset) => a.id === assigningId);

  return (
    <>
      <PageHeader
        title="Asset Management"
        subtitle="Fixed assets register, assignments and lifecycle"
        action={
          canRun && (
            <div className="flex gap-2">
              <Button variant="outline" disabled={runDep.isPending} onClick={() => runDep.mutate()}>
                <CalendarClock className="h-4 w-4" /> {runDep.isPending ? "Running…" : "Run depreciation"}
              </Button>
              <Button onClick={() => (showForm ? reset() : setShowForm(true))}><Plus className="h-4 w-4" /> New Asset</Button>
            </div>
          )
        }
      />

      {assigningAsset && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Assign “{assigningAsset.name}” ({assigningAsset.tag})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">To employee</label>
              <select
                className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                value={assignTo.employeeId}
                onChange={(e) => setAssignTo({ employeeId: e.target.value, departmentId: "" })}
              >
                <option value="">—</option>
                {(employees.data?.data ?? []).map((emp: any) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeNo})</option>)}
              </select>
            </div>
            <span className="pb-2 text-xs text-muted-foreground">or</span>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">To department</label>
              <select
                className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                value={assignTo.departmentId}
                onChange={(e) => setAssignTo({ employeeId: "", departmentId: e.target.value })}
              >
                <option value="">—</option>
                {(departments.data ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <Button disabled={(!assignTo.employeeId && !assignTo.departmentId) || assign.isPending} onClick={() => assign.mutate()}>
              {assign.isPending ? "Assigning…" : "Assign"}
            </Button>
            <Button variant="ghost" onClick={() => setAssigningId(null)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="mb-4">
          <CardHeader><CardTitle>{editingId ? "Edit Asset" : "Register New Asset"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input placeholder="Asset tag * (e.g. AST-003)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input placeholder="Serial number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
            <Input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Purchase date</label>
              <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Purchase cost</label>
              <Input type="number" min={0} step="0.01" placeholder="0.00" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Salvage value</label>
              <Input type="number" min={0} step="0.01" placeholder="0.00" value={form.salvageValue} onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Useful life (months)</label>
              <Input type="number" min={1} placeholder="e.g. 36" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Depreciation method</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.depreciationMethod}
                onChange={(e) => setForm({ ...form, depreciationMethod: e.target.value })}
              >
                <option value="STRAIGHT_LINE">Straight-line</option>
                <option value="DECLINING_BALANCE">Declining balance</option>
                <option value="NONE">None</option>
              </select>
            </div>
            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
              <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : editingId ? "Update asset" : "Add asset"}
              </Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {msg && <p className="mb-3 text-sm text-muted-foreground">{msg}</p>}
      {isLoading ? <Loading /> : <DataTable columns={columns} rows={data?.data ?? []} empty="No assets yet" />}
    </>
  );
}
