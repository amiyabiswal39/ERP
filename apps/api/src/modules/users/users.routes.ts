import { Router } from "express";
import { z } from "zod";
import { registerSchema, ROLES } from "@erp/shared";
import { prisma } from "../../lib/prisma";
import { authenticate, authorize } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler, ApiError } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { hashPassword } from "../../utils/password";

export const usersRouter = Router();

// Entire module is super-user (ADMIN) only.
usersRouter.use(authenticate, authorize("ADMIN"));

const publicUser = {
  id: true, email: true, firstName: true, lastName: true,
  role: true, isActive: true, lastLoginAt: true, createdAt: true,
} as const;

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "desc" } }));
  })
);

usersRouter.post(
  "/",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const exists = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (exists) throw ApiError.conflict("Email already registered");
    const user = await prisma.user.create({
      data: {
        email: req.body.email,
        passwordHash: await hashPassword(req.body.password),
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        role: req.body.role ?? "EMPLOYEE",
      },
      select: publicUser,
    });
    await audit(req, "user.create", "User", user.id, { email: user.email, role: user.role });
    res.status(201).json(user);
  })
);

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
});

usersRouter.patch(
  "/:id",
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    // Guard: an admin cannot strip their own admin role or deactivate themselves.
    if (req.params.id === req.user!.sub && (req.body.role && req.body.role !== "ADMIN" || req.body.isActive === false)) {
      throw ApiError.badRequest("You cannot change your own role or deactivate your own account");
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data: req.body, select: publicUser });
    await audit(req, "user.update", "User", user.id, req.body);
    res.json(user);
  })
);

usersRouter.post(
  "/:id/reset-password",
  validate(z.object({ password: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(req.body.password) },
    });
    await audit(req, "user.reset-password", "User", req.params.id);
    res.json({ ok: true });
  })
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.sub) throw ApiError.badRequest("You cannot delete your own account");
    await prisma.user.delete({ where: { id: req.params.id } });
    await audit(req, "user.delete", "User", req.params.id);
    res.status(204).send();
  })
);
