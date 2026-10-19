const { PENDING_STATUSES } = require("../constants/orderStatuses");

// Shadow SKUs: an old SKU (the shadow) that moved to a new SKU (its parent).
// Customers may keep ordering the old SKU. Before a packing slip is made, and
// when an order ships, each line on a shadow SKU is assigned by stock:
//   - covered by the shadow's own stock in that warehouse -> stays on the shadow
//   - partly covered -> split: what the shadow has stays, the rest moves to the parent
//   - not covered -> the whole line moves to the parent
// Old stock is used first, in ship-date order across every unshipped order, so
// two orders never claim the same boxes. Lines ordered on the parent (new) SKU
// are never moved. Returns a list of the changes made.
async function assignShadowLines(tx, orderIds) {
  if (!orderIds.length) return [];

  const target = await tx.orderLine.findMany({
    where: {
      orderId: { in: orderIds },
      order: { status: { notIn: ["SHIPPED", "CANCELLED"] } },
      product: { shadowParentId: { not: null } },
    },
    select: { productId: true },
  });
  const shadowIds = [...new Set(target.map((l) => l.productId))];
  if (!shadowIds.length) return [];

  const [shadows, stockRows, pendingLines] = await Promise.all([
    tx.product.findMany({ where: { id: { in: shadowIds } }, include: { shadowParent: { select: { id: true, sku: true } } } }),
    tx.warehouseStock.findMany({ where: { productId: { in: shadowIds } } }),
    // Every unshipped line on these shadows competes for the same boxes
    tx.orderLine.findMany({
      where: {
        productId: { in: shadowIds },
        order: { status: { in: [...PENDING_STATUSES, "DRAFT"] } },
      },
      include: { order: { select: { id: true, orderNumber: true } } },
      orderBy: [{ shipDate: "asc" }, { orderId: "asc" }, { id: "asc" }],
    }),
  ]);
  const shadowById = new Map(shadows.map((s) => [s.id, s]));
  const targetOrders = new Set(orderIds);

  // Remaining shadow stock per (product, warehouse); lines with no warehouse
  // draw from the shadow's total across warehouses.
  const remaining = new Map();
  const key = (productId, warehouseId) => `${productId}:${warehouseId ?? "all"}`;
  for (const row of stockRows) {
    remaining.set(key(row.productId, row.warehouseId), row.onHand);
    remaining.set(key(row.productId, null), (remaining.get(key(row.productId, null)) ?? 0) + row.onHand);
  }
  const take = (productId, warehouseId, qty) => {
    const k = key(productId, warehouseId);
    remaining.set(k, (remaining.get(k) ?? 0) - qty);
    if (warehouseId != null) remaining.set(key(productId, null), (remaining.get(key(productId, null)) ?? 0) - qty);
  };

  const changes = [];
  for (const line of pendingLines) {
    const available = Math.max(remaining.get(key(line.productId, line.warehouseId)) ?? 0, 0);
    if (!targetOrders.has(line.orderId)) {
      take(line.productId, line.warehouseId, line.quantity); // another order's claim
      continue;
    }
    const keep = Math.min(line.quantity, available);
    const move = line.quantity - keep;
    take(line.productId, line.warehouseId, keep);
    if (move === 0) continue;

    const shadow = shadowById.get(line.productId);
    const parent = shadow.shadowParent;
    if (keep === 0) {
      await tx.orderLine.update({ where: { id: line.id }, data: { productId: parent.id } });
    } else {
      await tx.orderLine.update({ where: { id: line.id }, data: { quantity: keep } });
      await tx.orderLine.create({
        data: {
          orderId: line.orderId,
          productId: parent.id,
          warehouseId: line.warehouseId,
          quantity: move,
          shipDate: line.shipDate,
          containerNumber: line.containerNumber,
          cartonMarking: line.cartonMarking,
        },
      });
    }
    changes.push({
      orderNumber: line.order.orderNumber,
      shadowSku: shadow.sku,
      parentSku: parent.sku,
      kept: keep,
      moved: move,
    });
  }
  return changes;
}

// Human-readable summary, e.g. "ORD-1042: 18 of JS-HNP-BLK moved to 24111 (old stock ran out)"
function describeShadowChanges(changes) {
  return changes.map((c) => (c.kept
    ? `${c.orderNumber}: ${c.kept} stay on ${c.shadowSku}, ${c.moved} moved to ${c.parentSku} (not enough old stock)`
    : `${c.orderNumber}: ${c.moved} of ${c.shadowSku} moved to ${c.parentSku} (no old stock left)`));
}

module.exports = { assignShadowLines, describeShadowChanges };
