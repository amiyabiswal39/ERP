import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const hash = (p: string) => bcrypt.hashSync(p, 10);

// Standard small-business chart of accounts
const ACCOUNTS = [
  { code: "1000", name: "Cash & Bank", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1500", name: "Fixed Assets", type: "ASSET" },
  { code: "1600", name: "Accumulated Depreciation", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2200", name: "Tax Payable", type: "LIABILITY" },
  { code: "2300", name: "Payroll Deductions Payable", type: "LIABILITY" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY" },
  { code: "4000", name: "Sales Revenue", type: "REVENUE" },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: "6000", name: "Salaries & Wages", type: "EXPENSE" },
  { code: "6100", name: "Rent Expense", type: "EXPENSE" },
  { code: "6200", name: "Utilities", type: "EXPENSE" },
  { code: "6300", name: "Depreciation Expense", type: "EXPENSE" },
] as const;

async function main() {
  console.log("🌱 Seeding…");

  // --- Currencies ---
  await prisma.currency.createMany({
    data: [
      { code: "USD", name: "US Dollar", symbol: "$", isBase: true },
      { code: "EUR", name: "Euro", symbol: "€" },
      { code: "INR", name: "Indian Rupee", symbol: "₹" },
    ],
    skipDuplicates: true,
  });

  // --- Chart of Accounts ---
  for (const a of ACCOUNTS) {
    await prisma.account.upsert({ where: { code: a.code }, update: {}, create: a as any });
  }
  const acc = Object.fromEntries(
    (await prisma.account.findMany()).map((a) => [a.code, a.id])
  ) as Record<string, string>;

  // --- Users (one per role) ---
  const users = [
    { email: "admin@erp.test", role: "ADMIN", firstName: "Ada", lastName: "Admin" },
    { email: "manager@erp.test", role: "MANAGER", firstName: "Max", lastName: "Manager" },
    { email: "hr@erp.test", role: "HR", firstName: "Hana", lastName: "HR" },
    { email: "accountant@erp.test", role: "ACCOUNTANT", firstName: "Amy", lastName: "Accounts" },
    { email: "employee@erp.test", role: "EMPLOYEE", firstName: "Eli", lastName: "Employee" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, role: u.role as any, passwordHash: hash("Password123!") },
    });
  }

  // --- Departments & Employees ---
  const eng = await prisma.department.upsert({ where: { name: "Engineering" }, update: {}, create: { name: "Engineering" } });
  const sales = await prisma.department.upsert({ where: { name: "Sales" }, update: {}, create: { name: "Sales" } });
  const employees = [
    { employeeNo: "EMP-001", firstName: "Eli", lastName: "Employee", jobTitle: "Developer", departmentId: eng.id, baseSalary: 6500 },
    { employeeNo: "EMP-002", firstName: "Nora", lastName: "Sales", jobTitle: "Account Executive", departmentId: sales.id, baseSalary: 5200 },
    { employeeNo: "EMP-003", firstName: "Sam", lastName: "Senior", jobTitle: "Tech Lead", departmentId: eng.id, baseSalary: 9000 },
  ];
  for (const e of employees) {
    await prisma.employee.upsert({ where: { employeeNo: e.employeeNo }, update: {}, create: { ...e, hireDate: new Date("2024-01-15"), status: "ACTIVE" } });
  }

  // --- Products ---
  const products = [
    { sku: "SVC-CONSULT", name: "Consulting (hour)", unitPrice: 150, taxRate: 10 },
    { sku: "SVC-SUPPORT", name: "Support Plan", unitPrice: 500, taxRate: 10 },
    { sku: "LIC-PRO", name: "Pro License", unitPrice: 1200, taxRate: 10 },
  ];
  for (const p of products) {
    await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  }
  const prodList = await prisma.product.findMany();

  // --- Customers ---
  const customerData = [
    { name: "Acme Corp", company: "Acme Corp", email: "ap@acme.test", phone: "555-0100" },
    { name: "Globex Ltd", company: "Globex Ltd", email: "billing@globex.test", phone: "555-0111" },
    { name: "Initech", company: "Initech", email: "accounts@initech.test", phone: "555-0122" },
    { name: "Umbrella Inc", company: "Umbrella Inc", email: "finance@umbrella.test", phone: "555-0133" },
  ];
  const customers = [];
  for (const c of customerData) {
    customers.push(await prisma.customer.create({ data: c }));
  }

  // --- Leads ---
  await prisma.lead.createMany({
    data: [
      { contactName: "Jane Prospect", customerId: customers[0].id, status: "QUALIFIED", estValue: 12000, source: "Website" },
      { contactName: "Bob Buyer", status: "NEW", estValue: 4000, source: "Referral" },
      { contactName: "Carol Closer", customerId: customers[1].id, status: "PROPOSAL", estValue: 25000, source: "Outbound" },
    ],
  });

  // --- Invoices + ledger postings (5 over recent months) ---
  let invNo = 0;
  async function makeInvoice(custId: string, monthsAgo: number, items: { product: any; qty: number }[], paid: boolean) {
    invNo++;
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    const lines = items.map((it) => {
      const net = it.qty * Number(it.product.unitPrice);
      const tax = (net * Number(it.product.taxRate)) / 100;
      return { description: it.product.name, productId: it.product.id, quantity: it.qty, unitPrice: Number(it.product.unitPrice), taxRate: Number(it.product.taxRate), lineTotal: net + tax, net, tax };
    });
    const subtotal = lines.reduce((s, l) => s + l.net, 0);
    const taxTotal = lines.reduce((s, l) => s + l.tax, 0);
    const total = subtotal + taxTotal;

    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-${String(invNo).padStart(5, "0")}`,
        customerId: custId,
        status: paid ? "PAID" : "SENT",
        issueDate: date,
        dueDate: new Date(date.getTime() + 30 * 86400000),
        subtotal, taxTotal, total,
        amountPaid: paid ? total : 0,
        items: { create: lines.map(({ net, tax, ...l }) => l) },
      },
    });

    // Dr AR / Cr Revenue + Tax
    await prisma.journalEntry.create({
      data: {
        date, source: "INVOICE", sourceId: invoice.id, memo: `Invoice ${invoice.number}`,
        lines: { create: [
          { accountId: acc["1100"], debit: total },
          { accountId: acc["4000"], credit: subtotal },
          { accountId: acc["2200"], credit: taxTotal },
        ] },
      },
    });

    if (paid) {
      const payDate = new Date(date.getTime() + 10 * 86400000);
      await prisma.payment.create({ data: { invoiceId: invoice.id, amount: total, method: "BANK_TRANSFER", paidAt: payDate } });
      await prisma.journalEntry.create({
        data: { date: payDate, source: "PAYMENT", sourceId: invoice.id, memo: `Payment ${invoice.number}`,
          lines: { create: [{ accountId: acc["1000"], debit: total }, { accountId: acc["1100"], credit: total }] } },
      });
    }
  }

  await makeInvoice(customers[0].id, 4, [{ product: prodList[2], qty: 3 }], true);
  await makeInvoice(customers[1].id, 3, [{ product: prodList[0], qty: 20 }], true);
  await makeInvoice(customers[2].id, 2, [{ product: prodList[1], qty: 4 }], true);
  await makeInvoice(customers[0].id, 1, [{ product: prodList[2], qty: 2 }], false);
  await makeInvoice(customers[3].id, 0, [{ product: prodList[0], qty: 10 }], false);

  // --- Some operating expenses (Dr Expense / Cr Cash) ---
  async function expense(code: string, amount: number, monthsAgo: number, memo: string) {
    const date = new Date(); date.setMonth(date.getMonth() - monthsAgo);
    await prisma.journalEntry.create({
      data: { date, source: "EXPENSE", memo,
        lines: { create: [{ accountId: acc[code], debit: amount }, { accountId: acc["1000"], credit: amount }] } },
    });
  }
  for (let m = 0; m < 4; m++) {
    await expense("6100", 2000, m, "Office rent");
    await expense("6200", 450, m, "Utilities");
    await expense("6000", 20700, m, "Monthly payroll");
  }

  // --- Assets ---
  const laptop = await prisma.asset.create({
    data: { tag: "AST-001", name: "MacBook Pro 16\"", category: "IT Equipment", purchaseCost: 2800, salvageValue: 300, usefulLifeMonths: 36, depreciationMethod: "STRAIGHT_LINE", status: "IN_USE", purchaseDate: new Date("2025-01-10") },
  });
  await prisma.asset.create({
    data: { tag: "AST-002", name: "Office Server", category: "IT Equipment", purchaseCost: 6500, salvageValue: 500, usefulLifeMonths: 60, status: "IN_STORAGE", purchaseDate: new Date("2024-06-01") },
  });
  const emp1 = await prisma.employee.findUnique({ where: { employeeNo: "EMP-001" } });
  if (emp1) await prisma.assetAssignment.create({ data: { assetId: laptop.id, employeeId: emp1.id, notes: "Primary work laptop" } });

  console.log("✅ Seed complete. Login with admin@erp.test / Password123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
