// Moves real on-hand stock when an order's status crosses the Shipped
// boundary. delta=-1 when entering Shipped (goods physically leave), +1 when
// leaving Shipped (correcting a mistake, or deleting a shipped order) — that
// stock movement is the only place "Shipped" differs from Confirmed/Routed,
// which only ever affect forward projections, never real on-hand.
async function adjustStockForShippedTransition(tx, lines, sign) {
  for (const line of lines) {
    if (!line.warehouseId) continue;
    // eslint-disable-next-line no-await-in-loop
    await tx.warehouseStock.upsert({
      where: { productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId } },
      update: { onHand: { increment: sign * line.quantity } },
      create: { productId: line.productId, warehouseId: line.warehouseId, onHand: sign * line.quantity },
    });
  }
}

function hasUnassignedLine(lines) {
  return lines.some((l) => l.warehouseId == null);
}

module.exports = { adjustStockForShippedTransition, hasUnassignedLine };
