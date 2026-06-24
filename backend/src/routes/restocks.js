const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

function serialize(restock) {
  return {
    id: restock.id,
    sku: restock.product.sku,
    productName: restock.product.name,
    warehouseId: restock.warehouseId,
    warehouseName: restock.warehouse.name,
    quantity: restock.quantity,
    expectedDate: restock.expectedDate.toISOString().slice(0, 10),
    supplier: restock.supplier,
    notes: restock.notes,
    shipmentId: restock.shipmentId,
  };
}

// GET /api/restocks — list all restocks sorted by expected_date
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const restocks = await prisma.restock.findMany({
      orderBy: { expectedDate: "asc" },
      include: { product: true, warehouse: true },
    });
    res.json(restocks.map(serialize));
  })
);

// POST /api/restocks — add a restock
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sku, warehouseId, quantity, expectedDate, supplier, notes, shipmentId } = req.body;
    if (!sku || !warehouseId || !quantity || !expectedDate) {
      return res.status(400).json({ message: "sku, warehouseId, quantity, and expectedDate are required" });
    }

    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) {
      return res.status(404).json({ message: `Unknown SKU: ${sku}` });
    }

    const restock = await prisma.restock.create({
      data: {
        productId: product.id,
        warehouseId,
        quantity,
        expectedDate: new Date(expectedDate),
        supplier,
        notes,
        shipmentId,
      },
      include: { product: true, warehouse: true },
    });

    res.status(201).json(serialize(restock));
  })
);

// PUT /api/restocks/:id — update restock (qty, date, warehouse)
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { quantity, expectedDate, warehouseId, supplier, notes } = req.body;

    try {
      const restock = await prisma.restock.update({
        where: { id },
        data: {
          ...(quantity !== undefined && { quantity }),
          ...(expectedDate !== undefined && { expectedDate: new Date(expectedDate) }),
          ...(warehouseId !== undefined && { warehouseId }),
          ...(supplier !== undefined && { supplier }),
          ...(notes !== undefined && { notes }),
        },
        include: { product: true, warehouse: true },
      });
      res.json(serialize(restock));
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ message: "Restock not found" });
      }
      throw err;
    }
  })
);

// DELETE /api/restocks/:id — delete restock
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    try {
      await prisma.restock.delete({ where: { id } });
      res.status(204).end();
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ message: "Restock not found" });
      }
      throw err;
    }
  })
);

module.exports = router;
