import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Customers } from "./pages/Customers";
import { Quotes } from "./pages/Quotes";
import { Orders } from "./pages/Orders";
import { Invoices } from "./pages/Invoices";
import { Finance } from "./pages/Finance";
import { HR } from "./pages/HR";
import { Payroll } from "./pages/Payroll";
import { Assets } from "./pages/Assets";
import { Admin } from "./pages/Admin";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireRole({ role, children }: { role: "ADMIN"; children: React.ReactNode }) {
  const hasRole = useAuthStore((s) => s.hasRole);
  return hasRole(role) ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/hr" element={<HR />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/admin" element={<RequireRole role="ADMIN"><Admin /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
