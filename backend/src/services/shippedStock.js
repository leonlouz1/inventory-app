const { changeStock } = require("./stock");

// Moves real on-hand stock when an order's status crosses the Shipped
// boundary. delta=-1 when entering Shipped (goods physically leave), +1 when
// leaving Shipped (correcting a mistake, or deleting a shipped order) — that
// stock movement is the only place "Shipped" differs from Confirmed/Routed,
// which only ever affect forward projections, never real on-hand.
// opts: { reason, note, orderId, by } for the stock history
async function adjustStockForShippedTransition(tx, lines, sign, opts = {}) {
  for (const line of lines) {
    if (!line.warehouseId) continue;
    // eslint-disable-next-line no-await-in-loop
    await changeStock(tx, {
      productId: line.productId,
      warehouseId: line.warehouseId,
      change: sign * line.quantity,
      reason: opts.reason || (sign < 0 ? "SHIPPED" : "UNSHIPPED"),
      note: opts.note,
      orderId: line.orderId ?? opts.orderId,
      by: opts.by,
    });
  }
}

function hasUnassignedLine(lines) {
  return lines.some((l) => l.warehouseId == null);
}

module.exports = { adjustStockForShippedTransition, hasUnassignedLine };
