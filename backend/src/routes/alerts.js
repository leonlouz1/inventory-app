const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { checkShortfallBatch, projectInventoryBatch } = require("../services/projection");
const { PENDING_STATUSES } = require("../constants/orderStatuses");

const router = express.Router();

function isoDate(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

// GET /api/alerts — all order lines with a shortfall or low-stock flag, sorted by ship_date.
// Past ship dates are ignored, per the projection scope business rule.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Only Confirmed/Routed lines can actually run into a shortfall worth
    // alerting on — Draft isn't committed yet, Shipped already happened,
    // Cancelled never will.
    const lines = await prisma.orderLine.findMany({
      where: { shipDate: { gte: today }, order: { status: { in: PENDING_STATUSES } } },
      include: { order: true, product: true, warehouse: true },
    });

    if (lines.length === 0) {
      return res.json([]);
    }

    // Three batched calls total — flat query cost no matter how many order lines exist.
    const [warehouseShortfalls, warehouseBalances, networkBalances] = await Promise.all([
      checkShortfallBatch(
        lines.map((l) => ({ sku: l.product.sku, warehouseId: l.warehouseId, shipDate: l.shipDate }))
      ),
      projectInventoryBatch(
        lines.map((l) => ({ sku: l.product.sku, warehouseId: l.warehouseId, targetDate: l.shipDate }))
      ),
      projectInventoryBatch(lines.map((l) => ({ sku: l.product.sku, warehouseId: null, targetDate: l.shipDate }))),
    ]);

    const alerts = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const warehouseAssigned = line.warehouseId != null;
      const warehouseBalance = warehouseAssigned ? warehouseBalances[i] : null;
      const networkBalance = networkBalances[i];
      const hadDipBeforeShipDate = warehouseAssigned && !warehouseShortfalls[i].ok;

      const flags = [];
      if (warehouseAssigned && (warehouseBalance < 0 || hadDipBeforeShipDate)) {
        flags.push("warehouse_shortage");
      }
      if (networkBalance < 0) {
        flags.push("network_shortage");
      }
      if (
        warehouseAssigned &&
        !flags.includes("warehouse_shortage") &&
        warehouseBalance < line.product.reorderPoint
      ) {
        flags.push("low_stock");
      }

      if (flags.length === 0) continue;

      alerts.push({
        orderLineId: line.id,
        orderId: line.orderId,
        orderNumber: line.order.orderNumber,
        customer: line.order.customer,
        sku: line.product.sku,
        productName: line.product.name,
        shipFrom: line.warehouse ? line.warehouse.name : null,
        shipDate: isoDate(line.shipDate),
        quantity: line.quantity,
        projectedAvailable: warehouseAssigned ? warehouseBalance : networkBalance,
        networkProjectedAvailable: networkBalance,
        flags,
      });
    }

    alerts.sort((a, b) => a.shipDate.localeCompare(b.shipDate));

    res.json(alerts);
  })
);

module.exports = router;
