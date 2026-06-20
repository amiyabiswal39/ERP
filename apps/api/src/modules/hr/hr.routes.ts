import { Router } from "express";
import { z } from "zod";
import { employeeSchema, leaveRequestSchema, paginationSchema } from "@erp/shared";
import { prisma } from "../../lib/prisma";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { payrollService } from "./payroll.service";

export const hrRouter = Router();
hrRouter.use(authenticate);

const HR_ROLES = ["HR", "MANAGER"] as const;

// ---- Payroll ----
hrRouter.get("/payroll", asyncHandler(async (_req, res) => {
  res.json(await payrollService.list());
}));

hrRouter.post(
  "/payroll/run",
  authorize(...HR_ROLES),
  validate(z.object({ periodStart: z.string().datetime(), periodEnd: z.string().datetime() })),
  asyncHandler(async (req, res) => {
    const result = await payrollService.runPayroll(new Date(req.body.periodStart), new Date(req.body.periodEnd));
    await audit(req, "payroll.run", "Payslip", undefined, result);
    res.status(201).json(result);
  })
);

hrRouter.post(
  "/payslips/:id/approve",
  authorize(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const slip = await payrollService.approve(req.params.id);
    await audit(req, "payslip.approve", "Payslip", slip.id);
    res.json(slip);
  })
);

hrRouter.post(
  "/payslips/:id/pay",
  authorize(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const slip = await payrollService.markPaid(req.params.id);
    await audit(req, "payslip.pay", "Payslip", slip.id, { net: slip.netPay });
    res.json(slip);
  })
);

// ---- Employees ----
hrRouter.get(
  "/employees",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = req.query as any;
    const where = search
      ? { OR: [{ firstName: { contains: search, mode: "insensitive" as const } }, { lastName: { contains: search, mode: "insensitive" as const } }, { employeeNo: { contains: search, mode: "insensitive" as const } }] }
      : {};
    const [data, total] = await Promise.all([
      prisma.employee.findMany({ where, include: { department: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.employee.count({ where }),
    ]);
    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  })
);

hrRouter.get(
  "/employees/:id",
  asyncHandler(async (req, res) => {
    const emp = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { department: true, contracts: true, leaveRequests: true, payslips: true, reviews: true, assetAssignments: { include: { asset: true } } },
    });
    if (!emp) throw ApiError.notFound("Employee not found");
    res.json(emp);
  })
);

hrRouter.post(
  "/employees",
  authorize(...HR_ROLES),
  validate(employeeSchema),
  asyncHandler(async (req, res) => {
    const emp = await prisma.employee.create({
      data: { ...req.body, email: req.body.email || null, hireDate: req.body.hireDate ? new Date(req.body.hireDate) : null },
    });
    await audit(req, "employee.create", "Employee", emp.id);
    res.status(201).json(emp);
  })
);

hrRouter.patch(
  "/employees/:id",
  authorize(...HR_ROLES),
  validate(employeeSchema.partial()),
  asyncHandler(async (req, res) => {
    const emp = await prisma.employee.update({ where: { id: req.params.id }, data: req.body });
    await audit(req, "employee.update", "Employee", emp.id);
    res.json(emp);
  })
);

hrRouter.delete(
  "/employees/:id",
  authorize(...HR_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.employee.delete({ where: { id: req.params.id } });
    await audit(req, "employee.delete", "Employee", req.params.id);
    res.status(204).send();
  })
);

// ---- Departments ----
hrRouter.get("/departments", asyncHandler(async (_req, res) => {
  res.json(await prisma.department.findMany({ include: { _count: { select: { employees: true } } }, orderBy: { name: "asc" } }));
}));

hrRouter.post(
  "/departments",
  authorize(...HR_ROLES),
  validate(z.object({ name: z.string().min(1), description: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.create({ data: req.body });
    await audit(req, "department.create", "Department", dept.id, { name: dept.name });
    res.status(201).json(dept);
  })
);

hrRouter.delete(
  "/departments/:id",
  authorize(...HR_ROLES),
  asyncHandler(async (req, res) => {
    // Employees keep existing; their departmentId is set null by the relation.
    await prisma.department.delete({ where: { id: req.params.id } });
    await audit(req, "department.delete", "Department", req.params.id);
    res.status(204).send();
  })
);

// ---- Leave requests ----
hrRouter.get("/leave", asyncHandler(async (_req, res) => {
  res.json(await prisma.leaveRequest.findMany({ include: { employee: { select: { firstName: true, lastName: true, employeeNo: true } } }, orderBy: { createdAt: "desc" }, take: 100 }));
}));

hrRouter.post(
  "/leave",
  validate(leaveRequestSchema),
  asyncHandler(async (req, res) => {
    const start = new Date(req.body.startDate);
    const end = new Date(req.body.endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    const leave = await prisma.leaveRequest.create({ data: { ...req.body, startDate: start, endDate: end, days } });
    await audit(req, "leave.create", "LeaveRequest", leave.id);
    res.status(201).json(leave);
  })
);

hrRouter.patch(
  "/leave/:id/status",
  authorize(...HR_ROLES),
  validate(z.object({ status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]) })),
  asyncHandler(async (req, res) => {
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: req.body.status, reviewedBy: req.user!.sub },
    });
    await audit(req, "leave.review", "LeaveRequest", leave.id, { status: leave.status });
    res.json(leave);
  })
);
