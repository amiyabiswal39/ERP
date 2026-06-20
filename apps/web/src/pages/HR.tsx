import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

const blankEmployee = {
  employeeNo: "", firstName: "", lastName: "", email: "",
  jobTitle: "", departmentId: "", hireDate: "", baseSalary: "",
};

interface Employee {
  id: string; employeeNo: string; firstName: string; lastName: string;
  jobTitle?: string; baseSalary: string; status: string; department?: { name: string };
}

export function HR() {
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.hasRole("HR", "MANAGER"));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankEmployee);
  const [error, setError] = useState("");

  const employees = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get("/hr/employees", { params: { pageSize: 50 } })).data });
  const leave = useQuery({ queryKey: ["leave"], queryFn: async () => (await api.get("/hr/leave")).data });
  const departments = useQuery({ queryKey: ["departments"], queryFn: async () => (await api.get("/hr/departments")).data });

  const reset = () => { setShowForm(false); setEditingId(null); setForm(blankEmployee); setError(""); };

  const onboard = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        employeeNo: form.employeeNo,
        firstName: form.firstName,
        lastName: form.lastName,
        baseSalary: Number(form.baseSalary) || 0,
      };
      if (form.email) payload.email = form.email;
      if (form.jobTitle) payload.jobTitle = form.jobTitle;
      if (form.departmentId) payload.departmentId = form.departmentId;
      if (form.hireDate) payload.hireDate = new Date(form.hireDate).toISOString();
      return editingId
        ? (await api.patch(`/hr/employees/${editingId}`, payload)).data
        : (await api.post("/hr/employees", payload)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); reset(); },
    onError: (e: any) => setError(e?.response?.data?.error ?? "Failed to save employee"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/hr/employees/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const startEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      employeeNo: e.employeeNo, firstName: e.firstName, lastName: e.lastName,
      email: e.email ?? "", jobTitle: e.jobTitle ?? "", departmentId: e.departmentId ?? "",
      hireDate: e.hireDate ? e.hireDate.slice(0, 10) : "", baseSalary: String(e.baseSalary ?? ""),
    });
    setShowForm(true);
  };

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/hr/leave/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave"] }),
  });

  const valid = form.employeeNo && form.firstName && form.lastName;

  const empCols: Column<Employee>[] = [
    { header: "No.", cell: (e) => e.employeeNo },
    { header: "Name", cell: (e) => <span className="font-medium">{e.firstName} {e.lastName}</span> },
    { header: "Title", cell: (e) => e.jobTitle ?? "—" },
    { header: "Department", cell: (e) => e.department?.name ?? "—" },
    { header: "Salary", cell: (e) => formatCurrency(Number(e.baseSalary)), className: "text-right" },
    { header: "Status", cell: (e) => <Badge variant={statusVariant(e.status)}>{e.status}</Badge> },
    {
      header: "",
      className: "text-right",
      cell: (e) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" onClick={() => startEdit(e)} title="Edit"><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={remove.isPending}
              onClick={() => window.confirm(`Delete ${e.firstName} ${e.lastName}?`) && remove.mutate(e.id)} title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const leaveCols: Column<any>[] = [
    { header: "Employee", cell: (l) => `${l.employee?.firstName} ${l.employee?.lastName}` },
    { header: "Type", cell: (l) => l.type },
    { header: "From", cell: (l) => formatDate(l.startDate) },
    { header: "To", cell: (l) => formatDate(l.endDate) },
    { header: "Days", cell: (l) => Number(l.days) },
    { header: "Status", cell: (l) => <Badge variant={statusVariant(l.status)}>{l.status}</Badge> },
    {
      header: "",
      cell: (l) =>
        canManage && l.status === "PENDING" ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => review.mutate({ id: l.id, status: "APPROVED" })}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: l.id, status: "REJECTED" })}>Reject</Button>
          </div>
        ) : null,
    },
  ];

  if (employees.isLoading) return <Loading />;

  return (
    <>
      <PageHeader
        title="HR & Payroll"
        subtitle="Employees, departments and leave"
        action={canManage && <Button onClick={() => (showForm ? reset() : setShowForm(true))}><UserPlus className="h-4 w-4" /> Onboard Employee</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{editingId ? "Edit Employee" : "New Employee Onboarding"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input placeholder="Employee No. *" value={form.employeeNo} onChange={(e) => setForm({ ...form, employeeNo: e.target.value })} />
            <Input placeholder="First name *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input placeholder="Last name *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Job title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="">Department…</option>
              {(departments.data ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Hire date</label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Base salary (monthly)</label>
              <Input type="number" min={0} step="0.01" placeholder="0.00" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} />
            </div>
            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
              <Button disabled={!valid || onboard.isPending} onClick={() => onboard.mutate()}>
                {onboard.isPending ? "Saving…" : editingId ? "Update employee" : "Add employee"}
              </Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Employees</CardTitle></CardHeader>
        <CardContent><DataTable columns={empCols} rows={employees.data?.data ?? []} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Leave Requests</CardTitle></CardHeader>
        <CardContent><DataTable columns={leaveCols} rows={leave.data ?? []} empty="No leave requests" /></CardContent>
      </Card>
    </>
  );
}
