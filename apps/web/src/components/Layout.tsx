import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, FileText, Wallet, UserCog, Boxes, Moon, Sun, LogOut, Menu,
  FileSignature, ClipboardList, Banknote, ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useThemeStore } from "@/store/theme";
import { useSettingsStore } from "@/store/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@erp/shared";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles?: Role[]; // undefined = all roles
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "Customers & CRM", icon: Users, roles: ["MANAGER", "ACCOUNTANT"] },
  { to: "/quotes", label: "Quotes", icon: FileSignature, roles: ["MANAGER", "ACCOUNTANT"] },
  { to: "/orders", label: "Sales Orders", icon: ClipboardList, roles: ["MANAGER", "ACCOUNTANT"] },
  { to: "/invoices", label: "Invoices", icon: FileText, roles: ["MANAGER", "ACCOUNTANT"] },
  { to: "/finance", label: "Finance", icon: Wallet, roles: ["ACCOUNTANT", "MANAGER"] },
  { to: "/hr", label: "HR", icon: UserCog, roles: ["HR", "MANAGER"] },
  { to: "/payroll", label: "Payroll", icon: Banknote, roles: ["HR", "MANAGER"] },
  { to: "/assets", label: "Assets", icon: Boxes, roles: ["MANAGER", "ACCOUNTANT"] },
  { to: "/admin", label: "Administration", icon: ShieldCheck, roles: [] },
];

export function Layout() {
  const { user, logout, hasRole } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const loadSettings = useSettingsStore((s) => s.load);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Load org base currency once authenticated so all amounts format correctly.
  useEffect(() => {
    loadSettings().catch(() => {});
  }, [loadSettings]);

  const visible = NAV.filter((n) => !n.roles || hasRole(...n.roles));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 transform border-r bg-card transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-5 font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">E</div>
          ERP Suite
        </div>
        <nav className="space-y-1 p-3">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="text-right text-sm">
              <div className="font-medium">{user?.firstName} {user?.lastName}</div>
              <div className="text-xs text-muted-foreground">{user?.role}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate("/login"); }} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
