const prisma = require("../prismaClient");

/**
 * Atomically claims all restocks whose expectedDate has passed by stamping
 * receivedAt in a single UPDATE...RETURNING, then increments warehouseStock.
 * The atomic claim prevents concurrent requests from double-applying the same
 * restock when multiple endpoints call this simultaneously on page load.
 */
async function applyPendingRestocks() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Single atomic operation: stamp receivedAt and return the claimed rows.
  // Any concurrent call will find these rows already stamped and skip them.
  const claimed = await prisma.$queryRaw`
    UPDATE restocks
    SET received_at = ${now}
    WHERE expected_date <= ${today} AND received_at IS NULL
    RETURNING id, product_id AS "productId", warehouse_id AS "warehouseId", quantity
  `;

  if (claimed.length === 0) return;

  await prisma.$transaction(
    claimed.map((r) =>
      prisma.warehouseStock.upsert({
        where: { productId_warehouseId: { productId: r.productId, warehouseId: r.warehouseId } },
        update: { onHand: { increment: r.quantity } },
        create: { productId: r.productId, warehouseId: r.warehouseId, onHand: r.quantity },
      })
    )
  );
}

module.exports = { applyPendingRestocks };
