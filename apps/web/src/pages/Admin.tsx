import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, KeyRound, Globe, Building2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { PageHeader, DataTable, Loading, Column } from "@/components/shared";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import type { Role } from "@erp/shared";

const ROLES: Role[] = ["ADMIN", "MANAGER", "HR", "ACCOUNTANT", "EMPLOYEE"];

interface User {
  id: string; email: string; firstName: string; lastName: string;
  role: Role; isActive: boolean; lastLoginAt?: string;
}

const blank = { email: "", password: "", firstName: "", lastName: "", role: "EMPLOYEE" as Role };

export function Admin() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { currencies, baseCurrency, setBase } = useSettingsStore();
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [dept, setDept] = useState({ name: "", description: "" });

  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });
  const departments = useQuery({ queryKey: ["departments"], queryFn: async () => (await api.get("/hr/departments")).data });

  const addDept = useMutation({
    mutationFn: async () => (await api.post("/hr/departments", dept)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); setDept({ name: "", description: "" }); },
  });

  const removeDept = useMutation({
    mutationFn: async (id: string) => api.delete(`/hr/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/users", form)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setForm(blank); setShowForm(false); setError(""); },
    onError: (e: any) => setError(e?.response?.data?.error ?? "Failed to create user"),
  });

  const patch = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => (await api.patch(`/users/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const reset = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => (await api.post(`/users/${id}/reset-password`, { password })).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const changeBase = useMutation({
    mutationFn: async (code: string) => setBase(code),
    // Re-fetch everything so all amounts re-render in the new currency.
    onSuccess: () => qc.invalidateQueries(),
  });

  const columns: Column<User>[] = [
    { header: "Name", cell: (u) => <span className="font-medium">{u.firstName} {u.lastName}{u.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</span> },
    { header: "Email", cell: (u) => u.email },
    {
      header: "Role",
      cell: (u) => (
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          value={u.role}
          disabled={u.id === me?.id || patch.isPending}
          onChange={(e) => patch.mutate({ id: u.id, data: { role: e.target.value as Role } })}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      ),
    },
    {
      header: "Status",
      cell: (u) => (
        <button
          disabled={u.id === me?.id}
          onClick={() => patch.mutate({ id: u.id, data: { isActive: !u.isActive } })}
          title={u.id === me?.id ? "You can't deactivate yourself" : "Toggle active"}
        >
          <Badge variant={statusVariant(u.isActive ? "ACTIVE" : "INACTIVE")}>{u.isActive ? "Active" : "Inactive"}</Badge>
        </button>
      ),
    },
    { header: "Last login", cell: (u) => formatDate(u.lastLoginAt) },
    {
      header: "",
      className: "text-right",
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" title="Reset password"
            onClick={() => {
              const pw = window.prompt(`New password for ${u.email} (min 8 chars):`);
              if (pw && pw.length >= 8) reset.mutate({ id: u.id, password: pw });
              else if (pw) window.alert("Password must be at least 8 characters");
            }}>
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Delete" disabled={u.id === me?.id || remove.isPending}
            onClick={() => window.confirm(`Delete ${u.email}?`) && remove.mutate(u.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle="Super-user controls — manage users and organization settings"
        action={<Button onClick={() => setShowForm((s) => !s)}><UserPlus className="h-4 w-4" /> New User</Button>}
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> Base Currency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Drives money formatting across every module.</p>
          <select
            className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
            value={baseCurrency}
            disabled={changeBase.isPending}
            onChange={(e) => changeBase.mutate(e.target.value)}
          >
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>)}
          </select>
          {changeBase.isPending && <span className="text-sm text-muted-foreground">Applying…</span>}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Departments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Input className="w-56" placeholder="Department name *" value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} />
            <Input className="w-64" placeholder="Description (optional)" value={dept.description} onChange={(e) => setDept({ ...dept, description: e.target.value })} />
            <Button disabled={!dept.name || addDept.isPending} onClick={() => addDept.mutate()}>
              <Plus className="h-4 w-4" /> {addDept.isPending ? "Adding…" : "Add department"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(departments.data ?? []).length === 0 && <span className="text-sm text-muted-foreground">No departments yet.</span>}
            {(departments.data ?? []).map((d: any) => (
              <span key={d.id} className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                <span className="font-medium">{d.name}</span>
                <Badge variant="muted">{d._count?.employees ?? 0} staff</Badge>
                <button
                  title="Delete department"
                  disabled={removeDept.isPending}
                  onClick={() => window.confirm(`Delete department "${d.name}"? Employees will be unassigned.`) && removeDept.mutate(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Create User</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input placeholder="First name *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input placeholder="Last name *" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input type="password" placeholder="Password * (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
              <Button disabled={!form.email || form.password.length < 8 || !form.firstName || !form.lastName || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creating…" : "Create user"}
              </Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent>
          {users.isLoading ? <Loading /> : <DataTable columns={columns} rows={users.data ?? []} empty="No users" />}
        </CardContent>
      </Card>
    </>
  );
}
