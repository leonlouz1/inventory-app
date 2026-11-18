// Every change to on-hand stock goes through changeStock so it lands in the
// stock history (stock_movements) with the reason and who did it.
//
// reason: INITIAL, IMPORT, MANUAL, STOCK_UPLOAD, TRANSFER_IN, TRANSFER_OUT,
//   RECEIVED, UNRECEIVED, RESTOCK_DELETED, SHIPPED, UNSHIPPED, ORDER_DELETED

// Pass either `change` (+/- units) or `setTo` (a new on-hand total).
// Returns the warehouse's on-hand after the change.
async function changeStock(tx, { productId, warehouseId, change, setTo, reason, note, orderId, restockId, containerId, by }) {
  const where = { productId_warehouseId: { productId, warehouseId } };
  let after;
  let delta;
  if (setTo !== undefined) {
    const current = await tx.warehouseStock.findUnique({ where });
    const before = current?.onHand ?? 0;
    await tx.warehouseStock.upsert({ where, update: { onHand: setTo }, create: { productId, warehouseId, onHand: setTo } });
    after = setTo;
    delta = setTo - before;
  } else {
    // Atomic increment, so two changes at once can't overwrite each other
    const row = await tx.warehouseStock.upsert({
      where,
      update: { onHand: { increment: change } },
      create: { productId, warehouseId, onHand: change },
    });
    after = row.onHand;
    delta = change;
  }
  if (delta !== 0) {
    await tx.stockMovement.create({
      data: {
        productId, warehouseId, change: delta, onHandAfter: after, reason,
        note: note ?? null, orderId: orderId ?? null, restockId: restockId ?? null,
        containerId: containerId ?? null, userName: by ?? null,
      },
    });
  }
  return after;
}

module.exports = { changeStock };
