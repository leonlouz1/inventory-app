const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// GET /api/warehouses — list all warehouses
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const warehouses = await prisma.warehouse.findMany({ orderBy: { id: "asc" } });
    res.json(warehouses);
  })
);

// POST /api/warehouses — add warehouse
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, location, email } = req.body;
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    try {
      const warehouse = await prisma.warehouse.create({ data: { name, location, email: email || null } });
      res.status(201).json(warehouse);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: `Warehouse name "${name}" already exists` });
      }
      throw err;
    }
  })
);

// PUT /api/warehouses/:id — update warehouse name/location
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, location, email } = req.body;

    try {
      const warehouse = await prisma.warehouse.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(location !== undefined && { location }),
          ...(email !== undefined && { email: email || null }),
        },
      });
      res.json(warehouse);
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ message: "Warehouse not found" });
      }
      if (err.code === "P2002") {
        return res.status(409).json({ message: `Warehouse name "${name}" already exists` });
      }
      throw err;
    }
  })
);

// DELETE /api/warehouses/:id — delete a warehouse, blocked if it has order
// lines, restocks, or any non-zero on-hand stock (all real historical/current
// data that must not silently disappear).
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const warehouse = await prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    const [orderLineCount, restockCount, nonZeroStockCount] = await Promise.all([
      prisma.orderLine.count({ where: { warehouseId: id } }),
      prisma.restock.count({ where: { warehouseId: id } }),
      prisma.warehouseStock.count({ where: { warehouseId: id, onHand: { gt: 0 } } }),
    ]);

    if (orderLineCount > 0 || restockCount > 0 || nonZeroStockCount > 0) {
      return res.status(409).json({
        message: `Cannot delete ${warehouse.name}: it has ${orderLineCount} order line(s), ${restockCount} restock(s), and ${nonZeroStockCount} product(s) with stock on hand. Clear those first.`,
      });
    }

    await prisma.$transaction([
      prisma.warehouseStock.deleteMany({ where: { warehouseId: id } }),
      prisma.warehouse.delete({ where: { id } }),
    ]);

    res.status(204).end();
  })
);

// POST /api/warehouses/transfer — move stock from one warehouse to another
router.post(
  "/transfer",
  asyncHandler(async (req, res) => {
    const { sku, fromWarehouseId, toWarehouseId, quantity } = req.body;

    if (!sku || !fromWarehouseId || !toWarehouseId || !quantity) {
      return res.status(400).json({ message: "sku, fromWarehouseId, toWarehouseId, and quantity are required" });
    }
    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ message: "Source and destination warehouses must be different" });
    }

    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return res.status(404).json({ message: `Unknown SKU "${sku}"` });

    const fromStock = await prisma.warehouseStock.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: fromWarehouseId } },
    });
    const available = fromStock?.onHand ?? 0;
    if (available < quantity) {
      return res.status(409).json({
        message: `Insufficient stock — only ${available} units available in source warehouse`,
      });
    }

    await prisma.$transaction([
      prisma.warehouseStock.update({
        where: { productId_warehouseId: { productId: product.id, warehouseId: fromWarehouseId } },
        data: { onHand: { decrement: quantity } },
      }),
      prisma.warehouseStock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: toWarehouseId } },
        update: { onHand: { increment: quantity } },
        create: { productId: product.id, warehouseId: toWarehouseId, onHand: quantity },
      }),
    ]);

    res.json({ message: `Transferred ${quantity} units of ${sku} successfully` });
  })
);

module.exports = router;
