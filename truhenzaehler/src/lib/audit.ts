import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Schreibt einen Protokolleintrag; speichert nur tatsächlich geänderte Felder. */
export async function audit(
  tx: Tx,
  e: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    reason?: string;
  },
) {
  let oldV = e.oldValues ?? null;
  let newV = e.newValues ?? null;
  if (oldV && newV) {
    const changed = Object.keys(newV).filter((k) => JSON.stringify(oldV![k]) !== JSON.stringify(newV![k]));
    oldV = Object.fromEntries(changed.map((k) => [k, oldV![k]]));
    newV = Object.fromEntries(changed.map((k) => [k, newV![k]]));
  }
  await tx.auditLog.create({
    data: {
      userId: e.userId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      oldValues: oldV ? JSON.stringify(oldV) : null,
      newValues: newV ? JSON.stringify(newV) : null,
      reason: e.reason ?? "",
    },
  });
}
