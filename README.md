# ERP Suite

A modular, production-ready ERP for small-to-medium businesses.

**Modules:** Sales & CRM · HR & Payroll · Asset Management · Finance & Accounting (double-entry) · Dashboard & Analytics.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn-style UI |
| State | Zustand (auth/theme/UI) + TanStack Query (server cache) |
| Auth | JWT (access + refresh) with role-based access control |
| Validation | Zod (shared between frontend & backend) |
| Charts | Recharts · **Exports** json2csv (CSV) + pdfkit (PDF) |

## Architecture

```
erp/
├─ packages/shared     # Zod schemas + types shared by API and web
├─ apps/api            # Express + Prisma backend (modular: src/modules/*)
└─ apps/web            # React frontend (pages, components/ui, store)
```

Every business area is a self-contained module (`auth`, `crm`, `sales`, `finance`,
`hr`, `assets`, `dashboard`). Adding a new module (Inventory, Manufacturing…) means
dropping a folder under `apps/api/src/modules/` and registering one line in
`apps/api/src/routes.ts`.

**Accounting is double-entry.** Invoices, payments, payroll and depreciation all post
balanced journal entries against the Chart of Accounts. The P&L, Balance Sheet and
Cash Flow reports are *derived* from journal lines — the general ledger is the single
source of truth.

## Run with Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

- Web → http://localhost:5173
- API → http://localhost:4000/api  (health: http://localhost:4000/health)
- Postgres → localhost:5432

The API container automatically runs migrations and seeds demo data on first boot.

## Run locally (without Docker)

Requires Node 20+ and a running PostgreSQL.

```bash
npm install                       # install all workspaces
cp .env.example apps/api/.env     # point DATABASE_URL at your Postgres

npm run build -w @erp/shared      # build shared types once
npm run db:migrate -w @erp/api    # create schema
npm run db:seed -w @erp/api       # load demo data
npm run dev                       # starts API (:4000) and web (:5173)
```

## Demo accounts

All use password **`Password123!`**

| Email | Role | Access |
|---|---|---|
| admin@erp.test | ADMIN | Everything |
| manager@erp.test | MANAGER | All business modules |
| accountant@erp.test | ACCOUNTANT | Finance, sales, assets |
| hr@erp.test | HR | Employees & leave |
| employee@erp.test | EMPLOYEE | Dashboard, self-service |

## Key API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Authenticate, returns tokens |
| GET | `/api/dashboard/summary` | KPI tiles |
| GET | `/api/dashboard/revenue-trend` | 12-month revenue/expense |
| GET/POST | `/api/customers` | List / create customers |
| GET | `/api/customers/export` | CSV export |
| GET/POST | `/api/sales/quotes` | List / create quotes |
| POST | `/api/sales/quotes/:id/convert` | Convert quote → sales order |
| GET/POST | `/api/sales/orders` | List / create sales orders |
| POST | `/api/sales/orders/:id/invoice` | Convert order → invoice (posts to ledger) |
| GET/POST | `/api/sales/invoices` | List / create invoices (posts to ledger) |
| POST | `/api/sales/invoices/:id/payments` | Record payment |
| GET | `/api/hr/payroll` | List payslips |
| POST | `/api/hr/payroll/run` | Generate payslips for a pay period |
| POST | `/api/hr/payslips/:id/approve` | Approve a draft payslip |
| POST | `/api/hr/payslips/:id/pay` | Mark paid + post PAYROLL journal entry |
| POST | `/api/assets/depreciation/run` | Post depreciation entries (Dr Expense / Cr Accum.) |
| GET | `/api/assets/:id/depreciation-schedule` | Full depreciation schedule preview |
| GET/POST | `/api/finance/accounts` | Chart of accounts |
| POST | `/api/finance/journal` | Post a manual journal entry |
| GET | `/api/finance/reports/profit-loss` | P&L (`?from=&to=`) |
| GET | `/api/finance/reports/balance-sheet` | Balance sheet (`?asOf=`) |
| GET | `/api/finance/reports/profit-loss/pdf` | P&L as PDF |
| GET/POST | `/api/hr/employees` | Employees |
| POST | `/api/hr/leave/:id/status` | Approve/reject leave |
| GET/POST | `/api/assets` | Fixed assets register |
| POST | `/api/assets/:id/assign` | Assign asset |

## Security & quality features

- JWT access/refresh with silent refresh on the client
- Role-based authorization middleware on every protected route
- Audit log for create/update/delete on key entities (visible on the dashboard)
- Zod validation on all write endpoints (shared schemas)
- Helmet, CORS, structured logging (pino), graceful shutdown
- Responsive layout, light/dark mode, CSV + PDF export
