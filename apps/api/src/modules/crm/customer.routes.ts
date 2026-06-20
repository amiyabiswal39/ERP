import { Router } from "express";
import { customerSchema, paginationSchema } from "@erp/shared";
import { z } from "zod";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { sendCsv, sendPdfTable } from "../../utils/export";
import { customerService } from "./customer.service";

export const customerRouter = Router();
customerRouter.use(authenticate);

const SALES_ROLES = ["MANAGER", "ACCOUNTANT"] as const;

customerRouter.get(
  "/",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await customerService.list(req.query as any));
  })
);

customerRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const rows = await customerService.listForExport();
    const format = String(req.query.format ?? "csv").toLowerCase();

    if (format === "pdf") {
      sendPdfTable(res, "customers", {
        title: "Customer List",
        subtitle: `${rows.length} customers · generated ${new Date().toDateString()}`,
        columns: [
          { key: "name", label: "Name", width: 130 },
          { key: "company", label: "Company", width: 120 },
          { key: "email", label: "Email", width: 160 },
          { key: "phone", label: "Phone", width: 100 },
        ],
        rows: rows.map((c) => ({
          name: c.name,
          company: c.company ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
        })),
      });
      return;
    }

    sendCsv(
      res,
      rows.map((c) => ({
        Name: c.name,
        Company: c.company,
        Email: c.email,
        Phone: c.phone,
        Active: c.isActive,
      })),
      "customers"
    );
  })
);

customerRouter.get(
  "/:id",
  validate(z.object({ id: z.string() }), "params"),
  asyncHandler(async (req, res) => {
    res.json(await customerService.getById(req.params.id));
  })
);

customerRouter.post(
  "/",
  authorize(...SALES_ROLES),
  validate(customerSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.create(req.body);
    await audit(req, "customer.create", "Customer", customer.id);
    res.status(201).json(customer);
  })
);

customerRouter.patch(
  "/:id",
  authorize(...SALES_ROLES),
  validate(customerSchema.partial()),
  asyncHandler(async (req, res) => {
    const customer = await customerService.update(req.params.id, req.body);
    await audit(req, "customer.update", "Customer", customer.id);
    res.json(customer);
  })
);

customerRouter.delete(
  "/:id",
  authorize("MANAGER"),
  asyncHandler(async (req, res) => {
    await customerService.remove(req.params.id);
    await audit(req, "customer.delete", "Customer", req.params.id);
    res.status(204).send();
  })
);
