import { Router } from "express";
import { z } from "zod";
import { assetSchema, paginationSchema } from "@erp/shared";
import { prisma } from "../../lib/prisma";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { depreciationService } from "./depreciation.service";

export const assetsRouter = Router();
assetsRouter.use(authenticate);

const ASSET_ROLES = ["MANAGER", "ACCOUNTANT"] as const;

// ---- Depreciation ----
assetsRouter.post(
  "/depreciation/run",
  authorize(...ASSET_ROLES),
  validate(z.object({ asOf: z.string().datetime().optional() })),
  asyncHandler(async (req, res) => {
    const result = await depreciationService.run(req.body.asOf ? new Date(req.body.asOf) : new Date());
    await audit(req, "depreciation.run", "Asset", undefined, result);
    res.status(201).json(result);
  })
);

assetsRouter.get(
  "/:id/depreciation-schedule",
  asyncHandler(async (req, res) => {
    res.json(await depreciationService.schedule(req.params.id));
  })
);

assetsRouter.get(
  "/",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, search } = req.query as any;
    const where = search
      ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { tag: { contains: search, mode: "insensitive" as const } }] }
      : {};
    const [data, total] = await Promise.all([
      prisma.asset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { assignments: { where: { returnedAt: null }, include: { employee: true, department: true } } } }),
      prisma.asset.count({ where }),
    ]);
    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  })
);

assetsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: { depreciation: { orderBy: { periodDate: "desc" } }, maintenance: { orderBy: { date: "desc" } }, assignments: { include: { employee: true, department: true } } },
    });
    if (!asset) throw ApiError.notFound("Asset not found");
    // current book value = cost - accumulated depreciation
    const accumulated = asset.depreciation.reduce((s, d) => s + Number(d.amount), 0);
    res.json({ ...asset, bookValue: Number(asset.purchaseCost) - accumulated });
  })
);

assetsRouter.post(
  "/",
  authorize(...ASSET_ROLES),
  validate(assetSchema),
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.create({
      data: { ...req.body, purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : null },
    });
    await audit(req, "asset.create", "Asset", asset.id);
    res.status(201).json(asset);
  })
);

assetsRouter.patch(
  "/:id",
  authorize(...ASSET_ROLES),
  validate(assetSchema.partial()),
  asyncHandler(async (req, res) => {
    const asset = await prisma.asset.update({ where: { id: req.params.id }, data: req.body });
    await audit(req, "asset.update", "Asset", asset.id);
    res.json(asset);
  })
);

assetsRouter.delete(
  "/:id",
  authorize(...ASSET_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.asset.delete({ where: { id: req.params.id } });
    await audit(req, "asset.delete", "Asset", req.params.id);
    res.status(204).send();
  })
);

// Assign an asset to an employee or department
assetsRouter.post(
  "/:id/assign",
  authorize(...ASSET_ROLES),
  validate(z.object({ employeeId: z.string().optional(), departmentId: z.string().optional(), notes: z.string().optional() })),
  asyncHandler(async (req, res) => {
    // close any open assignment first
    await prisma.assetAssignment.updateMany({ where: { assetId: req.params.id, returnedAt: null }, data: { returnedAt: new Date() } });
    const assignment = await prisma.assetAssignment.create({ data: { assetId: req.params.id, ...req.body } });
    await prisma.asset.update({ where: { id: req.params.id }, data: { status: "IN_USE" } });
    await audit(req, "asset.assign", "Asset", req.params.id, req.body);
    res.status(201).json(assignment);
  })
);

// Record maintenance
assetsRouter.post(
  "/:id/maintenance",
  authorize(...ASSET_ROLES),
  validate(z.object({ date: z.string().datetime(), description: z.string().min(1), cost: z.number().nonnegative().default(0), vendor: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const record = await prisma.maintenanceRecord.create({ data: { ...req.body, assetId: req.params.id, date: new Date(req.body.date) } });
    res.status(201).json(record);
  })
);
