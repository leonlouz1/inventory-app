const prisma = require("../prismaClient");

/**
 * Finds all restocks whose expectedDate has passed and receivedAt is null,
 * applies each one to warehouseStock (upsert), and stamps receivedAt = now.
 * Safe to call on every request — does nothing when there's nothing to process.
 */
async function applyPendingRestocks() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const pending = await prisma.restock.findMany({
    where: { expectedDate: { lte: today }, receivedAt: null },
  });

  if (pending.length === 0) return;

  await prisma.$transaction(
    pending.map((r) =>
      prisma.warehouseStock.upsert({
        where: { productId_warehouseId: { productId: r.productId, warehouseId: r.warehouseId } },
        update: { onHand: { increment: r.quantity } },
        create: { productId: r.productId, warehouseId: r.warehouseId, onHand: r.quantity },
      })
    )
  );

  await prisma.restock.updateMany({
    where: { id: { in: pending.map((r) => r.id) } },
    data: { receivedAt: now },
  });
}

module.exports = { applyPendingRestocks };
