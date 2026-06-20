import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { customerRouter } from "./modules/crm/customer.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { financeRouter } from "./modules/finance/finance.routes";
import { hrRouter } from "./modules/hr/hr.routes";
import { assetsRouter } from "./modules/assets/assets.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";

export const apiRouter = Router();

// Register a module = one line here. New modules (Inventory, Manufacturing…)
// drop in their own folder and add a route below — nothing else changes.
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/customers", customerRouter);
apiRouter.use("/sales", salesRouter);
apiRouter.use("/finance", financeRouter);
apiRouter.use("/hr", hrRouter);
apiRouter.use("/assets", assetsRouter);
apiRouter.use("/dashboard", dashboardRouter);
