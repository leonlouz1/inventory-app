const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const prisma = require("../prismaClient");
const { buildSkuTimeline } = require("../services/timeline");

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

    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return res.status(404).json({ message: `Unknown SKU: ${sku}` });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [restocks, orderLines] = await Promise.all([
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
      ...orderLines.map((l) => ({
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
    ].sort((a, b) => b.date.localeCompare(a.date));

    res.json(movements);
  })
);

module.exports = router;
