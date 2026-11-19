// Warehouses with countInAts off (e.g. POE — a container picked up at the
// port by the buyer) hold stock that's already spoken for. Their on-hand,
// and the orders and restocks assigned to them, stay out of ATS totals.
function atsWarehouseFilters(warehouses) {
  const excluded = warehouses.filter((w) => w.countInAts === false).map((w) => w.id);
  if (!excluded.length) return { excluded, orderLine: {}, restock: {} };
  return {
    excluded,
    // Order lines not yet assigned a warehouse still count
    orderLine: { OR: [{ warehouseId: null }, { warehouseId: { notIn: excluded } }] },
    restock: { warehouseId: { notIn: excluded } },
  };
}

module.exports = { atsWarehouseFilters };
