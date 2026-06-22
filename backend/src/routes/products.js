const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { buildSkuTimeline } = require("../services/timeline");

const router = express.Router();

// GET /api/products — list all products with on_hand per warehouse
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [products, warehouses] = await Promise.all([
      prisma.product.findMany({
        orderBy: { sku: "asc" },
        include: { stock: true },
      }),
      prisma.warehouse.findMany({ orderBy: { id: "asc" } }),
    ]);

    const result = products.map((product) => {
      const stockByWarehouse = {};
      let totalOnHand = 0;
      for (const warehouse of warehouses) {
        const row = product.stock.find((s) => s.warehouseId === warehouse.id);
        const onHand = row ? row.onHand : 0;
        stockByWarehouse[warehouse.id] = onHand;
        totalOnHand += onHand;
      }
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        reorderPoint: product.reorderPoint,
        reorderQty: product.reorderQty,
        leadTimeDays: product.leadTimeDays,
        stockByWarehouse,
        totalOnHand,
      };
    });

    res.json(result);
  })
);

// POST /api/products — create product, with optional initial on-hand per warehouse
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sku, name, category, reorderPoint, reorderQty, leadTimeDays, initialStock } = req.body;
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
    const { name, category, reorderPoint, reorderQty, leadTimeDays } = req.body;

    try {
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
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
