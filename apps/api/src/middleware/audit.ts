import { Request } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../config/logger";

/**
 * Record an audit log entry. Fire-and-forget — never blocks the request path
 * and never throws into the handler.
 */
export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.sub,
        action,
        entity,
        entityId,
        metadata: metadata as object | undefined,
        ipAddress: req.ip,
      },
    });
  } catch (err) {
    logger.warn({ err, action, entity }, "Failed to write audit log");
  }
}
