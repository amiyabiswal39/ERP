import { Router } from "express";
import { loginSchema, registerSchema } from "@erp/shared";
import { validate } from "../../middleware/validate";
import { authenticate, authorize } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { audit } from "../../middleware/audit";
import { authService } from "./auth.service";

export const authRouter = Router();

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  })
);

// Only admins may create new users/accounts
authRouter.post(
  "/register",
  authenticate,
  authorize("ADMIN"),
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    await audit(req, "user.create", "User", result.user.id, { email: result.user.email });
    res.status(201).json(result);
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    res.json(await authService.refresh(refreshToken));
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await authService.me(req.user!.sub));
  })
);
