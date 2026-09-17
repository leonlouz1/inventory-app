const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

const RESTOCK_STATUSES = ["DRAFT", "ON_HOLD", "IN_PRODUCTION", "EN_ROUTE", "RECEIVED"];

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
    linkedOrderId: restock.linkedOrderId,
    linkedOrderNumber: restock.linkedOrder?.orderNumber ?? null,
    status: restock.status || "IN_PRODUCTION",
    receivedAt: restock.receivedAt ? restock.receivedAt.toISOString() : null,
  };
}

// GET /api/restocks — list all restocks sorted by expected_date
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const restocks = await prisma.restock.findMany({
      orderBy: { expectedDate: "asc" },
      include: { product: true, warehouse: true, linkedOrder: true },
    });
    res.json(restocks.map(serialize));
  })
);

// POST /api/restocks — add a restock
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sku, warehouseId, quantity, expectedDate, supplier, notes, shipmentId, linkedOrderId, status } = req.body;
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
        status: status || "IN_PRODUCTION",
        ...(linkedOrderId !== undefined && { linkedOrderId: linkedOrderId || null }),
      },
      include: { product: true, warehouse: true, linkedOrder: true },
    });

    res.status(201).json(serialize(restock));
  })
);

// PATCH /api/restocks/:id/status — change status; applies/reverses stock when moving to/from RECEIVED
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!RESTOCK_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${RESTOCK_STATUSES.join(", ")}` });
    }

    const existing = await prisma.restock.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Restock not found" });

    const wasReceived = existing.status === "RECEIVED";
    const nowReceived = status === "RECEIVED";

    const restock = await prisma.$transaction(async (tx) => {
      // Moving TO received — add stock
      if (!wasReceived && nowReceived) {
        await tx.warehouseStock.upsert({
          where: { productId_warehouseId: { productId: existing.productId, warehouseId: existing.warehouseId } },
          update: { onHand: { increment: existing.quantity } },
          create: { productId: existing.productId, warehouseId: existing.warehouseId, onHand: existing.quantity },
        });
      }
      // Moving FROM received — reverse the stock
      if (wasReceived && !nowReceived) {
        await tx.warehouseStock.update({
          where: { productId_warehouseId: { productId: existing.productId, warehouseId: existing.warehouseId } },
          data: { onHand: { decrement: existing.quantity } },
        });
      }

      return tx.restock.update({
        where: { id },
        data: {
          status,
          receivedAt: nowReceived && !wasReceived ? new Date() : wasReceived && !nowReceived ? null : undefined,
        },
        include: { product: true, warehouse: true, linkedOrder: true },
      });
    });

    res.json(serialize(restock));
  })
);

// PUT /api/restocks/:id — update restock (qty, date, warehouse, etc.)
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { sku, quantity, expectedDate, warehouseId, supplier, notes, linkedOrderId, shipmentId } = req.body;

    try {
      let productId;
      if (sku !== undefined) {
        const product = await prisma.product.findUnique({ where: { sku } });
        if (!product) return res.status(404).json({ message: `Unknown SKU: ${sku}` });
        productId = product.id;
      }

      const restock = await prisma.restock.update({
        where: { id },
        data: {
          ...(productId !== undefined && { productId }),
          ...(quantity !== undefined && { quantity }),
          ...(expectedDate !== undefined && { expectedDate: new Date(expectedDate) }),
          ...(warehouseId !== undefined && { warehouseId }),
          ...(supplier !== undefined && { supplier }),
          ...(notes !== undefined && { notes }),
          ...(linkedOrderId !== undefined && { linkedOrderId: linkedOrderId || null }),
          ...(shipmentId !== undefined && { shipmentId }),
        },
        include: { product: true, warehouse: true, linkedOrder: true },
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
      const restock = await prisma.restock.findUnique({ where: { id } });
      if (!restock) return res.status(404).json({ message: "Restock not found" });

      await prisma.$transaction(async (tx) => {
        // If received, reverse the stock before deleting
        if (restock.status === "RECEIVED") {
          await tx.warehouseStock.update({
            where: { productId_warehouseId: { productId: restock.productId, warehouseId: restock.warehouseId } },
            data: { onHand: { decrement: restock.quantity } },
          });
        }
        await tx.restock.delete({ where: { id } });
      });

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
