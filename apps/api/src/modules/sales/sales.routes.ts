import { Router } from "express";
import { invoiceSchema, paymentSchema, paginationSchema, quoteSchema, salesOrderSchema } from "@erp/shared";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { invoiceService } from "./invoice.service";
import { quoteService, orderService } from "./pipeline.service";

export const salesRouter = Router();
salesRouter.use(authenticate);

const SALES_ROLES = ["MANAGER", "ACCOUNTANT"] as const;

// ---------------- Quotes ----------------
salesRouter.get("/quotes", asyncHandler(async (_req, res) => res.json(await quoteService.list())));
salesRouter.get("/quotes/:id", asyncHandler(async (req, res) => res.json(await quoteService.get(req.params.id))));

salesRouter.post(
  "/quotes",
  authorize(...SALES_ROLES),
  validate(quoteSchema),
  asyncHandler(async (req, res) => {
    const quote = await quoteService.create(req.body);
    await audit(req, "quote.create", "Quote", quote.id, { total: quote.total });
    res.status(201).json(quote);
  })
);

salesRouter.post(
  "/quotes/:id/convert",
  authorize(...SALES_ROLES),
  asyncHandler(async (req, res) => {
    const order = await quoteService.convertToOrder(req.params.id);
    await audit(req, "quote.convert", "Quote", req.params.id, { orderId: order.id });
    res.status(201).json(order);
  })
);

// ---------------- Sales Orders ----------------
salesRouter.get("/orders", asyncHandler(async (_req, res) => res.json(await orderService.list())));
salesRouter.get("/orders/:id", asyncHandler(async (req, res) => res.json(await orderService.get(req.params.id))));

salesRouter.post(
  "/orders",
  authorize(...SALES_ROLES),
  validate(salesOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await orderService.create(req.body);
    await audit(req, "order.create", "SalesOrder", order.id, { total: order.total });
    res.status(201).json(order);
  })
);

salesRouter.post(
  "/orders/:id/invoice",
  authorize(...SALES_ROLES),
  asyncHandler(async (req, res) => {
    const invoice = await orderService.convertToInvoice(req.params.id);
    await audit(req, "order.invoice", "SalesOrder", req.params.id, { invoiceId: invoice.id });
    res.status(201).json(invoice);
  })
);

salesRouter.get(
  "/invoices",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await invoiceService.list(req.query as any));
  })
);

salesRouter.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    res.json(await invoiceService.getById(req.params.id));
  })
);

salesRouter.post(
  "/invoices",
  authorize(...SALES_ROLES),
  validate(invoiceSchema),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.create(req.body);
    await audit(req, "invoice.create", "Invoice", invoice.id, { total: invoice.total });
    res.status(201).json(invoice);
  })
);

salesRouter.post(
  "/invoices/:id/payments",
  authorize(...SALES_ROLES),
  validate(paymentSchema),
  asyncHandler(async (req, res) => {
    const payment = await invoiceService.addPayment(req.params.id, req.body);
    await audit(req, "payment.create", "Payment", payment.id, { invoiceId: req.params.id });
    res.status(201).json(payment);
  })
);
