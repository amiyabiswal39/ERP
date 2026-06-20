import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/asyncHandler";

type Source = "body" | "query" | "params";

/** Validate a request part against a Zod schema; replaces it with parsed data. */
export function validate(schema: ZodSchema, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(ApiError.badRequest("Validation failed", result.error.flatten()));
    }
    // query/params are read-only getters in Express 5; assign defensively
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}
