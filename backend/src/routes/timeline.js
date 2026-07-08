const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const prisma = require("../prismaClient");
const { buildSkuTimeline } = require("../services/timeline");
const { applyPendingRestocks } = require("../services/autoReceive");

const router = express.Router();

// GET /api/timeline?sku=WDG-001&grain=month — 12 (or 16, for grain=week) period
// projection for one SKU, all warehouses, broken down by period
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { sku, grain } = req.query;
    if (!sku) {
      return res.status(400).json({ message: "sku query parameter is required" });
    }

    try {
      await applyPendingRestocks();
      const timeline = await buildSkuTimeline(sku, grain);
      res.json(timeline);
    } catch (err) {
      if (err.message && err.message.startsWith("Unknown SKU")) {
        return res.status(404).json({ message: err.message });
      }
      throw err;
    }
  })
);

// GET /api/timeline/history?sku=WDG-001 — past restocks received and shipped
// orders for one SKU, merged into a single chronological list
router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const { sku } = req.query;
    if (!sku) return res.status(400).json({ message: "sku query parameter is required" });

    await applyPendingRestocks();
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return res.status(404).json({ message: `Unknown SKU: ${sku}` });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [restocks, shippedLines, overdueLines] = await Promise.all([
      prisma.restock.findMany({
        where: { productId: product.id, expectedDate: { lte: today } },
        include: { warehouse: true, linkedOrder: true },
        orderBy: { expectedDate: "desc" },
      }),
      prisma.orderLine.findMany({
        where: { productId: product.id, order: { status: "SHIPPED" } },
        include: { order: true, warehouse: true },
        orderBy: { shipDate: "desc" },
      }),
      // Orders still in a pending status whose ship date has already passed —
      // these are invisible in the projection (past) and history (not shipped)
      // but still hold reserved stock.
      prisma.orderLine.findMany({
        where: {
          productId: product.id,
          shipDate: { lt: today },
          order: { status: { in: ["CONFIRMED", "ROUTED"] } },
        },
        include: { order: true, warehouse: true },
        orderBy: { shipDate: "desc" },
      }),
    ]);

    const movements = [
      ...restocks.map((r) => ({
        id: `r-${r.id}`,
        date: r.expectedDate.toISOString().slice(0, 10),
        type: "IN",
        qty: r.quantity,
        warehouse: r.warehouse.name,
        source: "Restock",
        detail: r.supplier || null,
        linkedOrderId: r.linkedOrderId,
        linkedOrderNumber: r.linkedOrder?.orderNumber ?? null,
      })),
      ...shippedLines.map((l) => ({
        id: `o-${l.id}`,
        date: l.shipDate.toISOString().slice(0, 10),
        type: "OUT",
        qty: l.quantity,
        warehouse: l.warehouse?.name ?? "Unassigned",
        source: "Order Shipped",
        detail: `${l.order.orderNumber} — ${l.order.customer}`,
        orderId: l.orderId,
        orderNumber: l.order.orderNumber,
      })),
      ...overdueLines.map((l) => ({
        id: `ov-${l.id}`,
        date: l.shipDate.toISOString().slice(0, 10),
        type: "OVERDUE",
        qty: l.quantity,
        warehouse: l.warehouse?.name ?? "Unassigned",
        source: "Overdue Order",
        detail: `${l.order.orderNumber} — ${l.order.customer}`,
        orderId: l.orderId,
        orderNumber: l.order.orderNumber,
        orderStatus: l.order.status,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    res.json(movements);
  })
);

module.exports = router;
