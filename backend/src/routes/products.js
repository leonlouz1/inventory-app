const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { buildSkuTimeline } = require("../services/timeline");

const router = express.Router();

// GET /api/products — list all products with on_hand per warehouse
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Past ship dates are ignored, per the projection scope business rule
    // (same convention as alerts.js): a line still counts as "pending" — not
    // yet shipped — through and including today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [products, warehouses, pendingByProduct] = await Promise.all([
      prisma.product.findMany({
        orderBy: { sku: "asc" },
        include: { stock: true },
      }),
      prisma.warehouse.findMany({ orderBy: { id: "asc" } }),
      prisma.orderLine.groupBy({
        by: ["productId"],
        where: { shipDate: { gte: today } },
        _sum: { quantity: true },
      }),
    ]);

    const pendingQtyByProductId = new Map(
      pendingByProduct.map((row) => [row.productId, row._sum.quantity ?? 0])
    );

    const result = products.map((product) => {
      const stockByWarehouse = {};
      let totalOnHand = 0;
      for (const warehouse of warehouses) {
        const row = product.stock.find((s) => s.warehouseId === warehouse.id);
        const onHand = row ? row.onHand : 0;
        stockByWarehouse[warehouse.id] = onHand;
        totalOnHand += onHand;
      }
      const pendingQty = pendingQtyByProductId.get(product.id) ?? 0;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        reorderPoint: product.reorderPoint,
        reorderQty: product.reorderQty,
        leadTimeDays: product.leadTimeDays,
        stockByWarehouse,
        totalOnHand,
        pendingQty,
        availableToSell: totalOnHand - pendingQty,
      };
    });

    res.json(result);
  })
);

// POST /api/products — create product, with optional initial on-hand per warehouse
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sku, name, brand, category, reorderPoint, reorderQty, leadTimeDays, initialStock } = req.body;
    if (!sku || !name) {
      return res.status(400).json({ message: "sku and name are required" });
    }

    const warehouses = await prisma.warehouse.findMany();
    const initialStockByWarehouse = new Map((initialStock || []).map((s) => [s.warehouseId, s.onHand]));

    try {
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            sku,
            name,
            brand: brand ?? null,
            category: category ?? null,
            reorderPoint: reorderPoint ?? 0,
            reorderQty: reorderQty ?? 0,
            leadTimeDays: leadTimeDays ?? 21,
          },
        });

        await tx.warehouseStock.createMany({
          data: warehouses.map((w) => ({
            productId: created.id,
            warehouseId: w.id,
            onHand: initialStockByWarehouse.get(w.id) ?? 0,
          })),
        });

        return created;
      });

      res.status(201).json(product);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: `SKU "${sku}" already exists` });
      }
      throw err;
    }
  })
);

// PUT /api/products/:id — update product (name, reorder_point, reorder_qty, lead_time_days)
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, brand, category, reorderPoint, reorderQty, leadTimeDays } = req.body;

    try {
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(brand !== undefined && { brand }),
          ...(category !== undefined && { category }),
          ...(reorderPoint !== undefined && { reorderPoint }),
          ...(reorderQty !== undefined && { reorderQty }),
          ...(leadTimeDays !== undefined && { leadTimeDays }),
        },
      });
      res.json(product);
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ message: "Product not found" });
      }
      throw err;
    }
  })
);

// DELETE /api/products/:id — delete a product, blocked if it has order lines or
// restocks (those are historical records tied to real orders/shipments and must
// not silently disappear). Its warehouse_stock rows are removed along with it.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const [orderLineCount, restockCount] = await Promise.all([
      prisma.orderLine.count({ where: { productId: id } }),
      prisma.restock.count({ where: { productId: id } }),
    ]);

    if (orderLineCount > 0 || restockCount > 0) {
      return res.status(409).json({
        message: `Cannot delete ${product.sku}: it has ${orderLineCount} order line(s) and ${restockCount} restock(s) on record. Remove those first.`,
      });
    }

    await prisma.$transaction([
      prisma.warehouseStock.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);

    res.status(204).end();
  })
);

// GET /api/products/:id/projection — full 12-month projection for one SKU, all warehouses
router.get(
  "/:id/projection",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const timeline = await buildSkuTimeline(product.sku, "month");
    res.json(timeline);
  })
);

module.exports = router;
