import { z } from "zod";

// ----- Roles (mirror Prisma enum) -----
export const ROLES = ["ADMIN", "MANAGER", "HR", "ACCOUNTANT", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

// ----- Auth -----
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(ROLES).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ----- Customers / CRM -----
export const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  taxId: z.string().optional(),
  billingAddr: z.string().optional(),
  shippingAddr: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const LEAD_STATUS = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
export const leadSchema = z.object({
  customerId: z.string().optional(),
  contactName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().optional(),
  status: z.enum(LEAD_STATUS).optional(),
  estValue: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

// ----- Line items (shared by quote/order/invoice) -----
export const lineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).default(0),
});
export type LineItemInput = z.infer<typeof lineItemSchema>;

export const invoiceSchema = z.object({
  customerId: z.string().min(1),
  salesOrderId: z.string().optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  currencyCode: z.string().length(3).default("USD"),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const quoteSchema = z.object({
  customerId: z.string().min(1),
  validUntil: z.string().datetime().optional(),
  currencyCode: z.string().length(3).default("USD"),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const salesOrderSchema = z.object({
  customerId: z.string().min(1),
  currencyCode: z.string().length(3).default("USD"),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;

export const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHECK", "OTHER"]).default("BANK_TRANSFER"),
  reference: z.string().optional(),
  paidAt: z.string().datetime().optional(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

// ----- Finance -----
export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export const accountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().optional(),
  description: z.string().optional(),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const journalLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  memo: z.string().optional(),
});
export const journalEntrySchema = z
  .object({
    date: z.string().datetime(),
    memo: z.string().optional(),
    lines: z.array(journalLineSchema).min(2),
  })
  .refine(
    (e) => {
      const d = e.lines.reduce((s, l) => s + l.debit, 0);
      const c = e.lines.reduce((s, l) => s + l.credit, 0);
      return Math.abs(d - c) < 0.005;
    },
    { message: "Journal entry must balance: total debits must equal total credits" }
  );
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;

// ----- HR -----
export const employeeSchema = z.object({
  employeeNo: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional(),
  hireDate: z.string().datetime().optional(),
  baseSalary: z.number().nonnegative().default(0),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const leaveRequestSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["ANNUAL", "SICK", "UNPAID", "MATERNITY", "OTHER"]).default("ANNUAL"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().optional(),
});
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

// ----- Assets -----
export const assetSchema = z.object({
  tag: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().datetime().optional(),
  purchaseCost: z.number().nonnegative().default(0),
  salvageValue: z.number().nonnegative().default(0),
  usefulLifeMonths: z.number().int().positive().optional(),
  depreciationMethod: z.enum(["STRAIGHT_LINE", "DECLINING_BALANCE", "NONE"]).default("STRAIGHT_LINE"),
  location: z.string().optional(),
});
export type AssetInput = z.infer<typeof assetSchema>;

// ----- Common -----
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  search: z.string().optional(),
});
